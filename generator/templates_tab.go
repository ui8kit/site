package main

// Templates tab: previews/templates/index.json (built by bun run templates:build from the source monorepo)
// -> /templates/, /templates/<app>/, /templates/<app>/<page>/ plus search entries.

import (
	"fmt"
	stdhtml "html"
	"os"
	"path/filepath"
	"strings"

	"github.com/ui8kit/site/generator/templates"
)

type tplIndex struct {
	SourceCommit string   `json:"sourceCommit"`
	Apps         []tplApp `json:"apps"`
}

type tplApp struct {
	Name  string    `json:"name"`
	Title string    `json:"title"`
	Docs  string    `json:"docs"`
	Frame []string  `json:"frame"`
	Pages []tplPage `json:"pages"`
}

type tplPage struct {
	Area     string   `json:"area"`
	Nav      string   `json:"nav"`
	Title    string   `json:"title"`
	Preview  bool     `json:"preview"`
	Blocks   []string `json:"blocks"`
	Sections int      `json:"sections"`
	Code     map[string]struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	} `json:"code"`
}

func buildTemplates(runtimes []string, itemURL map[string]string, nav []templates.NavGroup) []map[string]string {
	var idx tplIndex
	p := filepath.Join(cfg.previews, "templates", "index.json")
	if _, err := os.Stat(p); err != nil {
		return nil
	}
	readJSON(p, &idx)
	commit := short(idx.SourceCommit)
	var search []map[string]string
	meta := func(u, title, desc string) templates.Meta {
		return templates.Meta{Title: title, Description: desc, Path: u, SiteURL: cfg.siteURL, RegistryURL: cfg.registryURL, Nav: nav}
	}
	var apps []templates.TemplateApp
	for _, a := range idx.Apps {
		ta := templates.TemplateApp{Name: a.Name, Title: a.Title, Description: a.Docs, Href: "/templates/" + a.Name + "/"}
		seen := map[string]bool{}
		for _, pg := range a.Pages {
			ta.Pages = append(ta.Pages, templates.TemplatePageLink{Title: pg.Title, Nav: pg.Nav, Href: ta.Href + pg.Area + "/", Sections: pg.Sections})
			for _, b := range pg.Blocks {
				seen[b] = true
			}
		}
		ta.Blocks = len(seen)
		apps = append(apps, ta)
		render(ta.Href, meta(ta.Href, ta.Title+" (template) | ui8kit", ta.Description), templates.TemplateAppPage(ta), nil)
		search = append(search, map[string]string{"t": ta.Title, "n": a.Name, "k": "template", "c": "Templates", "d": ta.Description, "u": ta.Href})
		for _, pg := range a.Pages {
			u := ta.Href + pg.Area + "/"
			d := templates.TemplatePageData{App: ta, Title: pg.Title, Nav: pg.Nav, Sections: pg.Sections, Commit: commit,
				Install: "npx ui8kit add " + strings.Join(pg.Blocks, " ")}
			for _, b := range pg.Blocks {
				if h, ok := itemURL[b]; ok {
					d.Blocks = append(d.Blocks, templates.Related{Name: b, Href: h})
				}
			}
			if pg.Preview {
				if b, err := os.ReadFile(filepath.Join(cfg.previews, "templates", a.Name, pg.Area+".html")); err == nil {
					d.Preview = string(b)
				}
			}
			for _, rt := range runtimes {
				c, ok := pg.Code[rt]
				if !ok {
					continue
				}
				code := stdhtml.EscapeString(c.Content)
				if len(c.Content) <= highlightBudget && len(c.Content) <= maxHighlight {
					code = highlight(c.Name, c.Content)
				}
				d.Panels = append(d.Panels, templates.RuntimePanel{ID: "panel-" + rt, Runtime: rt, Label: runtimeLabels[rt],
					InstallInit: fmt.Sprintf("npx ui8kit init --yes --framework %s --dir src --registry-url %s/%s --strict-cdn", rt, cfg.registryURL, rt),
					InstallAdd:  d.Install,
					Files:       []templates.CodeFile{{ID: "code-" + rt, Name: c.Name, Content: c.Content, HTML: code}}})
			}
			for _, rt := range staticRuntimes { // no page-level template in these runtimes: the block templates the page is built from
				if p, ok := staticPanel(rt, pg.Blocks, true); ok {
					d.Panels = append(d.Panels, p)
				}
			}
			desc := fmt.Sprintf("%s page of the %s template: %d sections built from ui8kit registry blocks.", pg.Nav, ta.Title, pg.Sections)
			render(u, meta(u, ta.Title+": "+pg.Nav+" | ui8kit", desc), templates.TemplatePage(d), nil)
			search = append(search, map[string]string{"t": ta.Title + ": " + pg.Nav, "n": a.Name + "/" + pg.Area, "k": "template", "c": "Templates", "d": desc, "u": u})
		}
	}
	render("/templates/", meta("/templates/", "Templates | ui8kit", "Page templates built from ui8kit registry blocks, with static previews, code and the install command."),
		templates.TemplatesIndex(templates.TemplatesIndexData{Apps: apps, Commit: commit}), nil)
	return search
}
