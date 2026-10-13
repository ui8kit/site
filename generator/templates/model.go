// Package templates holds the page templates (templ) and the view models they render.
// The same templates can later be served by an SSR handler: they only depend on these structs.
package templates

// Meta is what every page needs in <head> and the shell.
type Meta struct {
	Title       string
	Description string
	Path        string // root-absolute URL path, e.g. /blocks/hero-split/
	SiteURL     string
	RegistryURL string // absolute registry base, e.g. https://registry.buildy.tw
	Nav         []NavGroup
}

// Skin is one choice of the skin picker (id = value of data-skin on <html>).
type Skin struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Skins is filled by the generator from assets/skins.json.
var Skins []Skin

type NavGroup struct {
	Title string
	Links []NavLink
}

type NavLink struct {
	Title string
	Href  string
}

type Counts struct {
	Runtime    string
	Primitives int
	Components int
	Blocks     int
	Total      int
}

type Card struct {
	Title       string
	Href        string
	Description string
	Tag         string
}

type HomeData struct {
	Version      string
	Commit       string
	Counts       []Counts
	Blocks       []Card
	Primitives   []Card
	RegistryBase string
}

type DocData struct {
	Title string
	HTML  string // rendered markdown (trusted: content/ is in this repo)
	Items []Card // optional list of items of a category page
	Prev  *NavLink
	Next  *NavLink
}

type DocsIndexData struct {
	Guides     []Card
	Categories []Card
}

type CodeFile struct {
	ID      string
	Name    string // install target
	Content string // plain source (the copy button reads it)
	HTML    string // highlighted source (chroma token spans, escaped)
}

type RuntimePanel struct {
	ID          string
	Runtime     string
	Label       string
	Files       []CodeFile
	JSONHref    string
	InstallInit string
	InstallAdd  string
	Deps        []string // npm
	Static      bool     // a server-template runtime: no CLI, Note and Helpers instead of the commands
	Note        string
	Helpers     []string
}

type Related struct {
	Name string
	Href string
}

type PropRow struct {
	Name     string
	Type     string
	Required bool
	Default  string
	Desc     string
}

type PropTable struct {
	Part string
	Docs string
	Rows []PropRow
}

type ItemData struct {
	Preview      string // static HTML of the item rendered at build time (trusted: built from the monorepo by registry/src/previews.ts)
	PropTables   []PropTable
	UsedIn       []Related
	Name         string
	Title        string
	Kind         string
	Category     string
	CategoryHref string
	Group        string
	Description  string
	Install      string
	Panels       []RuntimePanel
	Requires     []Related
}

type ListData struct {
	Title string
	Intro string
	Items []Card
}

func (c Card) HasTag() bool { return c.Tag != "" }

// Templates tab: theme apps of the monorepo (a set of pages built from registry blocks), from previews/templates/index.json
type TemplateApp struct {
	Name, Title, Description, Href string
	Pages                          []TemplatePageLink
	Blocks                         int
}

type TemplatePageLink struct {
	Title, Nav, Href string
	Sections         int
}

type TemplatesIndexData struct {
	Apps   []TemplateApp
	Commit string
}

type TemplatePageData struct {
	App      TemplateApp
	Title    string
	Nav      string
	Preview  string // static HTML rendered at build time (trusted: built from the monorepo by registry/src/templates.ts)
	Install  string
	Blocks   []Related
	Panels   []RuntimePanel
	Sections int
	Commit   string
}
