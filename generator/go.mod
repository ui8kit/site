module github.com/ui8kit/site/generator

go 1.26.0

require (
	github.com/a-h/templ v0.3.1070
	github.com/alecthomas/chroma/v2 v2.27.0
	github.com/codegen-x/ui8kit/packages/templ/ui v0.0.0
	github.com/yuin/goldmark v1.8.6
	github.com/yuin/goldmark-meta v1.1.0
)

require (
	github.com/dlclark/regexp2/v2 v2.2.1 // indirect
	gopkg.in/yaml.v2 v2.3.0 // indirect
)

// the ui8kit Go templ package, copied verbatim by scripts/sync-ui8kit-templ.sh
replace github.com/codegen-x/ui8kit/packages/templ/ui => ./ui8kit
