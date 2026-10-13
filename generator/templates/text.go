package templates

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed copy.json
var copyJSON []byte

var copyText = func() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(copyJSON, &m); err != nil {
		panic(err)
	}
	return m
}()

// T is the site text of a key of copy.json; Tf formats it. A missing key panics, so the build fails.
func T(key string) string {
	s, ok := copyText[key]
	if !ok {
		panic("templates: no text for " + key)
	}
	return s
}

// Tf formats the text of a key.
func Tf(key string, args ...any) string { return fmt.Sprintf(T(key), args...) }
