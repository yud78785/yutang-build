//go:build !windows

package main

import (
	"fmt"
	"os"
)

func main() {
	_, _ = fmt.Fprintln(os.Stderr, "YuTang Job Object guard is Windows-only.")
	os.Exit(2)
}
