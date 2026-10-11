package main

import (
	"bytes"
	"path"
	"regexp"
	"strings"

	"github.com/alecthomas/chroma/v2"
	chtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
)

// Syntax highlighting at generation time (chroma). The output only carries token classes (k, s, nf, ...); the colours are CSS variables
// (--tok-*) defined for light and dark in assets/site.src.css, so the browser needs no highlighter and a theme switch is a variable swap.
// maxHighlight is the largest source (bytes) that gets token spans.
const (
	maxHighlight    = 12 * 1024 // a single file above this stays plain
	highlightBudget = 12 * 1024 // source bytes highlighted per runtime panel
)

var formatter = chtml.New(chtml.WithClasses(true), chtml.PreventSurroundingPre(true))

func lexerFor(name string) chroma.Lexer {
	switch strings.ToLower(path.Ext(name)) {
	case ".svelte":
		return lexers.Get("svelte")
	case ".vue":
		return lexers.Get("vue")
	case ".tsx":
		return lexers.Get("tsx")
	case ".ts":
		return lexers.Get("typescript")
	case ".css":
		return lexers.Get("css")
	case ".json":
		return lexers.Get("json")
	}
	return lexers.Fallback
}

// plainTok are token classes that carry no colour here (names, punctuation, operators, whitespace); their spans are dropped to keep the page small.
var plainTok = regexp.MustCompile(`<span class="(?:n|nx|w|p|o|ow|l|nl|nn|ni|bp)">([^<]*)</span>`)

// highlight returns HTML (escaped, with token spans) for the source of a file.
func highlight(name, src string) string {
	lx := chroma.Coalesce(lexerFor(name))
	it, err := lx.Tokenise(nil, src)
	must(err)
	var buf bytes.Buffer
	must(formatter.Format(&buf, styles.Fallback, it))
	return plainTok.ReplaceAllString(buf.String(), "$1")
}
