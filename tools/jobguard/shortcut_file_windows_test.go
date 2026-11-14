//go:build windows

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func shortcutTestHash(value []byte) string {
	h := sha256.Sum256(value)
	return hex.EncodeToString(h[:])
}

func shortcutTestPaths(t *testing.T) (string, string, string, string) {
	t.Helper()
	dir := t.TempDir()
	return filepath.Join(dir, "YuTang.lnk"),
		filepath.Join(dir, ".YuTang.test.bak.lnk"),
		filepath.Join(dir, ".YuTang.test.tmp.lnk"),
		filepath.Join(dir, ".YuTang.test.quarantine.lnk")
}

func shortcutWrite(t *testing.T, name, content string) {
	t.Helper()
	if err := os.WriteFile(name, []byte(content), 0600); err != nil { t.Fatal(err) }
}

func shortcutRead(t *testing.T, name string) string {
	t.Helper()
	value, err := os.ReadFile(name)
	if err != nil { t.Fatal(err) }
	return string(value)
}

func TestShortcutHandleCommitNoReplace(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "old shortcut")
	shortcutWrite(t, temporary, "new shortcut")
	if err := commitShortcutHandleNoReplace(shortcut, backup, temporary, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut"))); err != nil {
		t.Fatalf("commit: %v", err)
	}
	if got := shortcutRead(t, shortcut); got != "new shortcut" { t.Fatalf("shortcut=%q", got) }
	if got := shortcutRead(t, backup); got != "old shortcut" { t.Fatalf("backup=%q", got) }
	if _, err := os.Lstat(temporary); !errors.Is(err, os.ErrNotExist) { t.Fatalf("temporary remains: %v", err) }
}

func TestShortcutHandleCommitRejectsModifiedOldAndStaged(t *testing.T) {
	t.Run("old", func(t *testing.T) {
		shortcut, backup, temporary, _ := shortcutTestPaths(t)
		shortcutWrite(t, shortcut, "user changed old")
		shortcutWrite(t, temporary, "new shortcut")
		err := commitShortcutHandleNoReplace(shortcut, backup, temporary, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut")))
		if err == nil { t.Fatal("modified old shortcut accepted") }
		if got := shortcutRead(t, shortcut); got != "user changed old" { t.Fatalf("user shortcut overwritten: %q", got) }
	})
	t.Run("staged", func(t *testing.T) {
		shortcut, backup, temporary, _ := shortcutTestPaths(t)
		shortcutWrite(t, shortcut, "old shortcut")
		shortcutWrite(t, temporary, "user changed staged")
		err := commitShortcutHandleNoReplace(shortcut, backup, temporary, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut")))
		if err == nil { t.Fatal("modified staged shortcut accepted") }
		if got := shortcutRead(t, shortcut); got != "old shortcut" { t.Fatalf("old shortcut changed: %q", got) }
		if got := shortcutRead(t, temporary); got != "user changed staged" { t.Fatalf("staged file changed: %q", got) }
	})
}

func TestShortcutHandleDeniesConcurrentWriteAndDeleteOpens(t *testing.T) {
	shortcut, _, _, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "old shortcut")
	locked, err := openLockedShortcutFile(shortcut)
	if err != nil { t.Fatal(err) }
	defer locked.Close()
	p, _ := syscall.UTF16PtrFromString(shortcut)
	for _, access := range []uint32{shortcutGenericWrite, shortcutDeleteAccess} {
		h, openErr := syscall.CreateFile(p, access, shortcutFileShareRead|shortcutFileShareWrite|shortcutFileShareDelete, nil, shortcutOpenExisting, 0, 0)
		if openErr == nil {
			_ = syscall.CloseHandle(h)
			t.Fatalf("conflicting open unexpectedly succeeded for access 0x%x", access)
		}
		if !errors.Is(openErr, syscall.Errno(32)) { t.Fatalf("open error=%v, want sharing violation", openErr) }
	}
}

func TestShortcutHandleExistingWriterPreventsLock(t *testing.T) {
	shortcut, _, _, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "old shortcut")
	p, _ := syscall.UTF16PtrFromString(shortcut)
	writer, err := syscall.CreateFile(p, shortcutGenericWrite, shortcutFileShareRead|shortcutFileShareWrite|shortcutFileShareDelete, nil, shortcutOpenExisting, 0, 0)
	if err != nil { t.Fatal(err) }
	defer syscall.CloseHandle(writer)
	if _, err := openLockedShortcutFile(shortcut); err == nil { t.Fatal("lock opened while writer handle existed") }
}

func isShortcutDestinationExists(err error) bool {
	return errors.Is(err, syscall.Errno(80)) || errors.Is(err, syscall.Errno(183))
}

func TestShortcutHandleNoReplacePreservesConcurrentCreator(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "old shortcut")
	shortcutWrite(t, temporary, "new shortcut")
	old, err := openLockedShortcutFile(shortcut)
	if err != nil { t.Fatal(err) }
	defer old.Close()
	next, err := openLockedShortcutFile(temporary)
	if err != nil { t.Fatal(err) }
	defer next.Close()
	if err := old.RenameNoReplace(backup); err != nil { t.Fatal(err) }
	shortcutWrite(t, shortcut, "user created shortcut")
	err = next.RenameNoReplace(shortcut)
	if err == nil || !isShortcutDestinationExists(err) { t.Fatalf("no-replace rename error=%v, want destination-exists", err) }
	if got := shortcutRead(t, shortcut); got != "user created shortcut" { t.Fatalf("user file overwritten: %q", got) }
	if got, hashErr := old.SHA256(); hashErr != nil || got != shortcutTestHash([]byte("old shortcut")) {
		t.Fatalf("pinned old file hash=%s err=%v", got, hashErr)
	}
	if err := old.Close(); err != nil { t.Fatal(err) }
	if got := shortcutRead(t, backup); got != "old shortcut" { t.Fatalf("backup changed: %q", got) }
}

func TestShortcutHandleRestoreNoReplace(t *testing.T) {
	t.Run("normal", func(t *testing.T) {
		shortcut, backup, _, quarantine := shortcutTestPaths(t)
		shortcutWrite(t, shortcut, "new shortcut")
		shortcutWrite(t, backup, "old shortcut")
		if err := restoreShortcutHandleNoReplace(shortcut, backup, quarantine, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut"))); err != nil { t.Fatal(err) }
		if got := shortcutRead(t, shortcut); got != "old shortcut" { t.Fatalf("restored=%q", got) }
	})
	t.Run("user edit", func(t *testing.T) {
		shortcut, backup, _, quarantine := shortcutTestPaths(t)
		shortcutWrite(t, shortcut, "user edited shortcut")
		shortcutWrite(t, backup, "old shortcut")
		err := restoreShortcutHandleNoReplace(shortcut, backup, quarantine, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut")))
		if err == nil { t.Fatal("user edit did not block restore") }
		if got := shortcutRead(t, shortcut); got != "user edited shortcut" { t.Fatalf("user shortcut overwritten: %q", got) }
		if got := shortcutRead(t, backup); got != "old shortcut" { t.Fatalf("backup changed: %q", got) }
	})
}

func TestShortcutHandleRestoreNoReplaceWhenUserCreatesDuringGap(t *testing.T) {
	shortcut, backup, _, _ := shortcutTestPaths(t)
	shortcutWrite(t, backup, "old shortcut")
	old, err := openLockedShortcutFile(backup)
	if err != nil { t.Fatal(err) }
	defer old.Close()
	shortcutWrite(t, shortcut, "user created shortcut")
	err = old.RenameNoReplace(shortcut)
	if err == nil || !isShortcutDestinationExists(err) { t.Fatalf("no-replace restore error=%v, want destination-exists", err) }
	if got := shortcutRead(t, shortcut); got != "user created shortcut" { t.Fatalf("user path overwritten: %q", got) }
	if got, hashErr := old.SHA256(); hashErr != nil || got != shortcutTestHash([]byte("old shortcut")) {
		t.Fatalf("pinned backup hash=%s err=%v", got, hashErr)
	}
	if err := old.Close(); err != nil { t.Fatal(err) }
	if got := shortcutRead(t, backup); got != "old shortcut" { t.Fatalf("backup changed: %q", got) }
}

func TestShortcutHandleDeleteChecksIdentity(t *testing.T) {
	shortcut, _, _, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "user edited shortcut")
	if err := deleteShortcutIfHash(shortcut, shortcutTestHash([]byte("old shortcut"))); err == nil { t.Fatal("changed file deleted") }
	if got := shortcutRead(t, shortcut); got != "user edited shortcut" { t.Fatalf("user file deleted: %q", got) }
}

func TestShortcutHandleDeleteExactFile(t *testing.T) {
	shortcut, _, _, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "temporary shortcut")
	if err := deleteShortcutIfHash(shortcut, shortcutTestHash([]byte("temporary shortcut"))); err != nil { t.Fatal(err) }
	if _, err := os.Lstat(shortcut); !errors.Is(err, os.ErrNotExist) { t.Fatalf("file remains: %v", err) }
}

func TestShortcutHandleCommitRejectsExistingBackup(t *testing.T) {
	shortcut, backup, temporary, _ := shortcutTestPaths(t)
	shortcutWrite(t, shortcut, "old shortcut")
	shortcutWrite(t, backup, "user backup")
	shortcutWrite(t, temporary, "new shortcut")
	err := commitShortcutHandleNoReplace(shortcut, backup, temporary, shortcutTestHash([]byte("old shortcut")), shortcutTestHash([]byte("new shortcut")))
	if err == nil { t.Fatal("existing backup was overwritten") }
	if got := shortcutRead(t, backup); got != "user backup" { t.Fatalf("user backup overwritten: %q", got) }
}

func TestShortcutHandleRejectsReparsePoint(t *testing.T) {
	shortcut, _, _, _ := shortcutTestPaths(t)
	target := filepath.Join(filepath.Dir(shortcut), "target.lnk")
	shortcutWrite(t, target, "target shortcut")
	if err := os.Symlink(target, shortcut); err != nil { t.Skipf("symlink unavailable: %v", err) }
	if _, err := openLockedShortcutFile(shortcut); err == nil { t.Fatal("reparse point accepted") }
}
