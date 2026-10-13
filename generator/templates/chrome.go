package templates

import selectfield "github.com/codegen-x/ui8kit/packages/templ/ui/ui/select"

func mainLinks() []NavLink {
	return []NavLink{
		{Title: T("nav.docs"), Href: "/docs/"},
		{Title: T("nav.blocks"), Href: "/docs/categories/blocks-marketing/"},
		{Title: T("nav.primitives"), Href: "/docs/categories/primitives/"},
		{Title: T("nav.templates"), Href: "/templates/"},
		{Title: T("nav.cli"), Href: "/docs/cli/"},
	}
}

func themeOptions() []selectfield.SelectOptionItem {
	return []selectfield.SelectOptionItem{{Value: "system", Label: T("theme.system")}, {Value: "light", Label: T("theme.light")}, {Value: "dark", Label: T("theme.dark")}}
}

func skinOptions() []selectfield.SelectOptionItem {
	out := []selectfield.SelectOptionItem{{Value: "", Label: T("skin.default")}}
	for _, s := range Skins {
		out = append(out, selectfield.SelectOptionItem{Value: s.ID, Label: s.Label})
	}
	return out
}
