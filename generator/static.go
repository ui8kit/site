package main

import (
	"fmt"
	stdhtml "html"
	"os"
	"path/filepath"

	"github.com/ui8kit/site/generator/templates"
)

// The server-template runtimes (Go templ, Twig, Jinja2, Latte): not in r/ and not installed by the CLI. Their files come from
// previews/static-code.json (bun run static-code:build, read from packages/<rt>/ui of the source monorepo); a panel lists the helper
// files to copy instead of the npx commands.
var staticRuntimes = []string{"templ", "twig", "jinja2", "latte"}

type staticFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Omitted int    `json:"omitted"`
}

type staticCode struct {
	SourceCommit string `json:"sourceCommit"`
	Runtimes     map[string]struct {
		Label   string                  `json:"label"`
		Helpers []string                `json:"helpers"`
		Items   map[string][]staticFile `json:"items"`
	} `json:"runtimes"`
}

var static staticCode

func loadStaticCode() {
	p := filepath.Join(cfg.previews, "static-code.json")
	if _, err := os.Stat(p); err == nil {
		readJSON(p, &static)
	}
}

// staticPanel: the files of the named items (a page: its blocks, in order, each file once) in one runtime; ok=false when it has none.
func staticPanel(rt string, names []string, highlightAll bool) (templates.RuntimePanel, bool) {
	r, ok := static.Runtimes[rt]
	if !ok {
		return templates.RuntimePanel{}, false
	}
	p := templates.RuntimePanel{ID: "panel-" + rt, Runtime: rt, Label: runtimeLabels[rt], Static: true, Helpers: r.Helpers, Note: templates.T("code.static." + rt)}
	seen := map[string]bool{}
	budget := highlightBudget
	for _, n := range names {
		for _, fl := range r.Items[n] {
			if seen[fl.Name] {
				continue
			}
			seen[fl.Name] = true
			f := templates.CodeFile{ID: fmt.Sprintf("code-%s-%d", rt, len(p.Files)), Name: fl.Name, Content: fl.Content}
			switch {
			case fl.Omitted > 0:
				f.Content = ""
				f.HTML = stdhtml.EscapeString(templates.Tf("code.omitted", fl.Omitted/1024))
			case highlightAll && len(fl.Content) <= budget && len(fl.Content) <= maxHighlight:
				budget -= len(fl.Content)
				f.HTML = highlight(fl.Name, fl.Content)
			default:
				f.HTML = stdhtml.EscapeString(fl.Content)
			}
			p.Files = append(p.Files, f)
		}
	}
	return p, len(p.Files) > 0
}
