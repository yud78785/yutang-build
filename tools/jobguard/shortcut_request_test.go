package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func shortcutRequestFixture() (string, string, string, string) {
	dir := os.TempDir()
	return filepath.Join(dir, "YuTang.lnk"),
		filepath.Join(dir, "YuTang.backup.lnk"),
		filepath.Join(dir, "YuTang.temporary.lnk"),
		filepath.Join(dir, "YuTang.quarantine.lnk")
}

func TestParseShortcutOperationCommit(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutRequestFixture()
	oldHash, newHash := strings.Repeat("a", 64), strings.Repeat("b", 64)
	got, err := parseShortcutOperationRequest([]string{
		"--shortcut-commit",
		"--owner-pid", "101",
		"--shortcut", shortcut,
		"--backup", backup,
		"--temporary", temporary,
		"--old-sha256", oldHash,
		"--new-sha256", newHash,
	}, 101)
	if err != nil { t.Fatal(err) }
	if got.operation != "--shortcut-commit" || got.ownerPID != 101 ||
		got.shortcut != shortcut || got.backup != backup || got.temporary != temporary ||
		got.oldSHA256 != oldHash || got.newSHA256 != newHash {
		t.Fatalf("unexpected request: %+v", got)
	}
}

func TestParseShortcutOperationRestore(t *testing.T) {
	shortcut, backup, _, quarantine := shortcutRequestFixture()
	got, err := parseShortcutOperationRequest([]string{
		"--shortcut-restore",
		"--owner-pid", "101",
		"--shortcut", shortcut,
		"--backup", backup,
		"--quarantine", quarantine,
		"--old-sha256", strings.Repeat("a", 64),
		"--new-sha256", strings.Repeat("b", 64),
	}, 101)
	if err != nil { t.Fatal(err) }
	if got.operation != "--shortcut-restore" || got.quarantine != quarantine { t.Fatalf("unexpected request: %+v", got) }
}

func TestParseShortcutOperationDelete(t *testing.T) {
	shortcut, _, _, _ := shortcutRequestFixture()
	got, err := parseShortcutOperationRequest([]string{
		"--shortcut-delete", "--owner-pid", "101", "--path", shortcut, "--sha256", strings.Repeat("a", 64),
	}, 101)
	if err != nil { t.Fatal(err) }
	if got.operation != "--shortcut-delete" || got.path != shortcut { t.Fatalf("unexpected request: %+v", got) }
}

func TestParseShortcutOperationRejectsWrongParent(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutRequestFixture()
	_, err := parseShortcutOperationRequest([]string{
		"--shortcut-commit", "--owner-pid", "101", "--shortcut", shortcut, "--backup", backup,
		"--temporary", temporary, "--old-sha256", strings.Repeat("a", 64), "--new-sha256", strings.Repeat("b", 64),
	}, 999)
	if err == nil { t.Fatal("wrong immediate parent accepted") }
}

func TestParseShortcutOperationRejectsDuplicateUnknownAndRelativeArguments(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutRequestFixture()
	base := []string{"--shortcut-commit", "--owner-pid", "101", "--shortcut", shortcut, "--backup", backup,
		"--temporary", temporary, "--old-sha256", strings.Repeat("a", 64), "--new-sha256", strings.Repeat("b", 64)}
	duplicate := append(append([]string{}, base...), "--owner-pid", "101")
	if _, err := parseShortcutOperationRequest(duplicate, 101); err == nil { t.Fatal("duplicate argument accepted") }
	unknown := append(append([]string{}, base...), "--unexpected", "value")
	if _, err := parseShortcutOperationRequest(unknown, 101); err == nil { t.Fatal("unknown argument accepted") }
	relative := append([]string{}, base...)
	relative[4] = "relative.lnk"
	if _, err := parseShortcutOperationRequest(relative, 101); err == nil { t.Fatal("relative path accepted") }
}

func TestParseShortcutOperationRejectsInvalidHashesAndAliasedPaths(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutRequestFixture()
	invalidHash := []string{"--shortcut-commit", "--owner-pid", "101", "--shortcut", shortcut, "--backup", backup,
		"--temporary", temporary, "--old-sha256", "bad", "--new-sha256", strings.Repeat("b", 64)}
	if _, err := parseShortcutOperationRequest(invalidHash, 101); err == nil { t.Fatal("invalid hash accepted") }
	aliased := []string{"--shortcut-commit", "--owner-pid", "101", "--shortcut", shortcut, "--backup", shortcut,
		"--temporary", temporary, "--old-sha256", strings.Repeat("a", 64), "--new-sha256", strings.Repeat("b", 64)}
	if _, err := parseShortcutOperationRequest(aliased, 101); err == nil { t.Fatal("aliased paths accepted") }
}
