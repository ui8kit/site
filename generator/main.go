// Command generator writes the ui8kit docs site as static HTML.
//
//	go run . --registry ../r --content ../content --out ../dist
//
// Inputs: content/*.md (front matter + markdown) and the registry r/ (registry.json + one JSON per item and runtime).
// Output: dist/ (HTML, assets, search-index.json, sitemap.xml and and optionally a copy of r/ with --include-registry).
package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/a-h/templ"
	"github.com/ui8kit/site/generator/templates"
	"github.com/yuin/goldmark"
	meta "github.com/yuin/goldmark-meta"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

//go:embed assets/site.css assets/app.js
var assets embed.FS

type registry struct {
	Version      string `json:"version"`
	SourceCommit string `json:"sourceCommit"`
	Runtimes     []string
	Items        []item `json:"items"`
}

type item struct {
	Name        string                `json:"name"`
	Title       string                `json:"title"`
	Kind        string                `json:"kind"`
	Category    string                `json:"category"`
	Group       string                `json:"group"`
	Description string                `json:"description"`
	Runtimes    map[string]runtimeRef `json:"runtimes"`
}

type runtimeRef struct {
	Path                 string   `json:"path"`
	RegistryDependencies []string `json:"registryDependencies"`
	Dependencies         []string `json:"dependencies"`
}

type itemFile struct {
	Files []struct {
		Target  string `json:"target"`
		Content string `json:"content"`
	} `json:"files"`
}

type doc struct {
	Slug, Title, Desc, Section, Filter, HTML string
	Order                                    int
}

var runtimeLabels = map[string]string{"svelte": "Svelte", "react": "React", "vue": "Vue"}

var cfg struct {
	registry, content, out, siteURL, registryURL string
	includeRegistry                              bool
}

const (
	defaultSiteURL     = "https://ui.buildy.tw"
	defaultRegistryURL = "https://registry.buildy.tw"
)

type page struct {
	path  string // root-absolute, trailing slash
	title string
}

var pages []page

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func main() {
	flag.StringVar(&cfg.registry, "registry", "../r", "registry directory (r/)")
	flag.StringVar(&cfg.content, "content", "../content", "markdown content directory")
	flag.StringVar(&cfg.out, "out", "../dist", "output directory")
	flag.StringVar(&cfg.siteURL, "site-url", envOr("SITE_URL", defaultSiteURL), "absolute site URL (canonical links, sitemap, robots)")
	flag.StringVar(&cfg.registryURL, "registry-url", envOr("REGISTRY_URL", defaultRegistryURL), "absolute registry base URL (install commands, JSON links); <registry-url>/<runtime> is the CLI registryUrl")
	flag.BoolVar(&cfg.includeRegistry, "include-registry", os.Getenv("INCLUDE_REGISTRY") == "1", "also copy r/ into <out>/r (default off: the registry is served from its own domain; env INCLUDE_REGISTRY=1)")
	flag.Parse()
	cfg.siteURL = strings.TrimRight(cfg.siteURL, "/")
	cfg.registryURL = strings.TrimRight(cfg.registryURL, "/")

	var reg registry
	readJSON(filepath.Join(cfg.registry, "registry.json"), &reg)
	docs := loadDocs()

	must(os.RemoveAll(cfg.out))
	nav := buildNav(docs)

	// assets and registry copy
	for _, f := range []string{"site.css", "app.js"} {
		b, err := assets.ReadFile("assets/" + f)
		must(err)
		write("assets/"+f, b)
	}
	if cfg.includeRegistry {
		must(copyDir(cfg.registry, filepath.Join(cfg.out, "r")))
	}

	itemURL := map[string]string{}
	for _, it := range reg.Items {
		itemURL[it.Name] = urlFor(it)
	}

	// home
	home := templates.HomeData{Version: reg.Version, Commit: short(reg.SourceCommit), RegistryBase: cfg.registryURL}
	for _, rt := range reg.Runtimes {
		c := templates.Counts{Runtime: rt}
		for _, it := range reg.Items {
			if _, ok := it.Runtimes[rt]; !ok {
				continue
			}
			switch it.Kind {
			case "primitive":
				c.Primitives++
			case "component":
				c.Components++
			case "block":
				c.Blocks++
			}
		}
		c.Total = c.Primitives + c.Components + c.Blocks
		home.Counts = append(home.Counts, c)
	}
	byName := map[string]item{}
	for _, it := range reg.Items {
		byName[it.Name] = it
	}
	for _, n := range []string{"hero-split", "pricing-tiers", "feature-grid", "cta-band", "bento-grid"} {
		if it, ok := byName[n]; ok {
			home.Blocks = append(home.Blocks, card(it))
		}
	}
	for _, n := range []string{"button", "card", "input"} {
		if it, ok := byName[n]; ok {
			home.Primitives = append(home.Primitives, card(it))
		}
	}
	render("/", templates.Meta{Title: "ui8kit: blocks and primitives for Svelte, React and Vue", Description: "Static docs and registry of ui8kit: copy the code or install it with npx ui8kit add.", Path: "/", SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL}, templates.Home(home), nil)

	// docs index + markdown pages
	idx := templates.DocsIndexData{}
	for _, d := range docs {
		c := templates.Card{Title: d.Title, Href: docURL(d), Description: d.Desc}
		if d.Section == "categories" {
			idx.Categories = append(idx.Categories, c)
		} else {
			idx.Guides = append(idx.Guides, c)
		}
	}
	render("/docs/", templates.Meta{Title: "Documentation | ui8kit", Description: "Guides and category pages of the ui8kit registry.", Path: "/docs/", SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL, Nav: nav}, templates.DocsIndex(idx), nil)
	for _, d := range docs {
		data := templates.DocData{Title: d.Title, HTML: d.HTML}
		if d.Filter != "" {
			for _, it := range reg.Items {
				if matches(it, d.Filter) {
					data.Items = append(data.Items, card(it))
				}
			}
		}
		p := docURL(d)
		render(p, templates.Meta{Title: d.Title + " | ui8kit", Description: d.Desc, Path: p, SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL, Nav: nav}, templates.Doc(data), nil)
	}

	// item pages
	var search []map[string]string
	for _, it := range reg.Items {
		d := templates.ItemData{
			Name: it.Name, Title: it.Title, Kind: it.Kind, Category: it.Category, Group: it.Group,
			Description: it.Description, Install: "npx ui8kit add " + it.Name,
			CategoryHref: categoryHref(docs, it),
		}
		reqSeen := map[string]bool{}
		for _, rt := range reg.Runtimes {
			ref, ok := it.Runtimes[rt]
			if !ok {
				continue
			}
			var f itemFile
			readJSON(filepath.Join(cfg.registry, filepath.FromSlash(ref.Path)), &f)
			p := templates.RuntimePanel{
				ID: "panel-" + rt, Runtime: rt, Label: runtimeLabels[rt], JSONHref: cfg.registryURL + "/" + ref.Path, Deps: ref.Dependencies,
				InstallInit: fmt.Sprintf("npx ui8kit init --yes --framework %s --dir src --registry-url %s/%s --strict-cdn", rt, cfg.registryURL, rt),
				InstallAdd:  "npx ui8kit add " + it.Name,
			}
			for i, fl := range f.Files {
				p.Files = append(p.Files, templates.CodeFile{ID: fmt.Sprintf("code-%s-%d", rt, i), Name: fl.Target, Content: fl.Content})
			}
			d.Panels = append(d.Panels, p)
			for _, r := range ref.RegistryDependencies {
				if u, ok := itemURL[r]; ok && !reqSeen[r] {
					reqSeen[r] = true
					d.Requires = append(d.Requires, templates.Related{Name: r, Href: u})
				}
			}
		}
		sort.Slice(d.Requires, func(i, j int) bool { return d.Requires[i].Name < d.Requires[j].Name })
		u := itemURL[it.Name]
		render(u, templates.Meta{Title: it.Title + " (" + it.Kind + ") | ui8kit", Description: it.Description, Path: u, SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL, Nav: nav}, templates.Item(d), nil)
		search = append(search, map[string]string{"t": it.Title, "n": it.Name, "k": it.Kind, "c": it.Category, "d": it.Description, "u": u})
	}
	for _, d := range docs {
		search = append(search, map[string]string{"t": d.Title, "n": d.Slug, "k": "doc", "c": d.Section, "d": d.Desc, "u": docURL(d)})
	}
	sb, err := json.Marshal(search)
	must(err)
	write("search-index.json", sb)

	// 404, robots, sitemap
	renderFile("404.html", templates.Meta{Title: "Not found | ui8kit", Description: "Page not found.", Path: "/404.html", SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL, Nav: nav},
		templates.Doc(templates.DocData{Title: "Page not found", HTML: `<p>This page does not exist. Try the <a href="/docs/">documentation</a> or the search.</p>`}))
	write("robots.txt", []byte("User-agent: *\nAllow: /\nSitemap: "+cfg.siteURL+"/sitemap.xml\n"))
	sort.Slice(pages, func(i, j int) bool { return pages[i].path < pages[j].path })
	var sm bytes.Buffer
	sm.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n" + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, p := range pages {
		fmt.Fprintf(&sm, "  <url><loc>%s%s</loc></url>\n", cfg.siteURL, p.path)
	}
	sm.WriteString("</urlset>\n")
	write("sitemap.xml", sm.Bytes())
	fmt.Printf("generated %d pages (+404) into %s\n", len(pages), cfg.out)
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func short(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

func readJSON(p string, v any) {
	b, err := os.ReadFile(p)
	must(err)
	must(json.Unmarshal(b, v))
}

func write(rel string, b []byte) {
	p := filepath.Join(cfg.out, filepath.FromSlash(rel))
	must(os.MkdirAll(filepath.Dir(p), 0o755))
	must(os.WriteFile(p, b, 0o644))
}

func render(urlPath string, m templates.Meta, body templ.Component, _ any) {
	rel := strings.TrimPrefix(urlPath, "/") + "index.html"
	renderFile(rel, m, body)
	pages = append(pages, page{path: urlPath, title: m.Title})
}

func renderFile(rel string, m templates.Meta, body templ.Component) {
	var buf bytes.Buffer
	ctx := templ.WithChildren(context.Background(), body)
	must(templates.Layout(m).Render(ctx, &buf))
	write(rel, buf.Bytes())
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		t := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(t, 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(t, b, 0o644)
	})
}

func urlFor(it item) string {
	switch it.Kind {
	case "primitive":
		return "/primitives/" + it.Name + "/"
	case "component":
		return "/components/" + it.Name + "/"
	case "block":
		return "/blocks/" + it.Name + "/"
	}
	return "/lib/" + it.Name + "/"
}

func card(it item) templates.Card {
	return templates.Card{Title: it.Title, Href: urlFor(it), Description: it.Description, Tag: it.Kind + " / " + it.Category}
}

func matches(it item, filter string) bool {
	k, c, _ := strings.Cut(filter, ":")
	return it.Kind == k && (c == "" || it.Category == c)
}

func categoryHref(docs []doc, it item) string {
	for _, d := range docs {
		if d.Filter != "" && matches(it, d.Filter) {
			return docURL(d)
		}
	}
	return "/docs/"
}

func docURL(d doc) string {
	if d.Section == "categories" {
		return "/docs/categories/" + d.Slug + "/"
	}
	return "/docs/" + d.Slug + "/"
}

func buildNav(docs []doc) []templates.NavGroup {
	g := templates.NavGroup{Title: "Guides", Links: []templates.NavLink{{Title: "Overview", Href: "/docs/"}}}
	c := templates.NavGroup{Title: "Categories"}
	for _, d := range docs {
		l := templates.NavLink{Title: d.Title, Href: docURL(d)}
		if d.Section == "categories" {
			c.Links = append(c.Links, l)
		} else {
			g.Links = append(g.Links, l)
		}
	}
	return []templates.NavGroup{g, c}
}

var preRe = regexp.MustCompile(`<pre>`)

func loadDocs() []doc {
	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM, meta.Meta),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
		goldmark.WithRendererOptions(html.WithUnsafe()),
	)
	var docs []doc
	files, err := filepath.Glob(filepath.Join(cfg.content, "*.md"))
	must(err)
	sort.Strings(files)
	for _, f := range files {
		src, err := os.ReadFile(f)
		must(err)
		var buf bytes.Buffer
		ctx := parser.NewContext()
		must(md.Convert(src, &buf, parser.WithContext(ctx)))
		m, merr := meta.TryGet(ctx)
		if merr != nil {
			log.Fatalf("%s: front matter: %v", f, merr)
		}
		str := func(k string) string { s, _ := m[k].(string); return s }
		d := doc{Slug: strings.TrimSuffix(filepath.Base(f), ".md"), Title: str("title"), Desc: str("description"), Section: str("section"), Filter: str("filter")}
		if v, ok := m["order"].(int); ok {
			d.Order = v
		}
		if d.Title == "" {
			log.Fatalf("%s: front matter needs a title", f)
		}
		if d.Section == "" {
			d.Section = "guides"
		}
		d.HTML = strings.ReplaceAll(buf.String(), "{{REGISTRY_URL}}", cfg.registryURL)
		d.HTML = preRe.ReplaceAllString(d.HTML, `<pre tabindex="0">`)
		docs = append(docs, d)
	}
	sort.SliceStable(docs, func(i, j int) bool {
		if docs[i].Section != docs[j].Section {
			return docs[i].Section > docs[j].Section // guides before categories
		}
		if docs[i].Order != docs[j].Order {
			return docs[i].Order < docs[j].Order
		}
		return docs[i].Slug < docs[j].Slug
	})
	return docs
}
