//go:build windows

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

const (
	shortcutGenericRead              = 0x80000000
	shortcutDeleteAccess             = 0x00010000
	shortcutGenericWrite             = 0x40000000
	shortcutFileShareRead            = 0x00000001
	shortcutFileShareWrite           = 0x00000002
	shortcutFileShareDelete          = 0x00000004
	shortcutOpenExisting              = 3
	shortcutFileFlagOpenReparsePoint = 0x00200000
	shortcutFileAttributeDirectory   = 0x00000010
	shortcutFileAttributeReparse     = 0x00000400
	shortcutFileAttributeTagInfoClass = 9
	shortcutFileRenameInfoClass       = 3
	shortcutFileDispositionInfoClass  = 4
	shortcutMaxBytes                  = 1 << 20
)

type shortcutFileAttributeTagInfoBuffer struct {
	FileAttributes uint32
	ReparseTag     uint32
}

// FILE_RENAME_INFO uses a 4-byte union followed by an aligned HANDLE.
// A zero union value means ReplaceIfExists=false for FileRenameInfo.
type shortcutFileRenameInfoBuffer struct {
	ReplaceIfExists uint32
	RootDirectory   syscall.Handle
	FileNameLength  uint32
	FileName        [1]uint16
}

type shortcutFileDispositionInfoBuffer struct {
	DeleteFile byte
}

var (
	shortcutKernel32                     = syscall.NewLazyDLL("kernel32.dll")
	shortcutGetFileInformationByHandleEx = shortcutKernel32.NewProc("GetFileInformationByHandleEx")
	shortcutSetFileInformationByHandle   = shortcutKernel32.NewProc("SetFileInformationByHandle")
)

type lockedShortcutFile struct {
	file *os.File
}

// openLockedShortcutFile pins one regular file object and denies new write/delete
// opens while the handle is held. Existing incompatible handles cause a safe failure.
func openLockedShortcutFile(name string) (*lockedShortcutFile, error) {
	p, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(
		p,
		shortcutGenericRead|shortcutDeleteAccess,
		shortcutFileShareRead,
		nil,
		shortcutOpenExisting,
		shortcutFileFlagOpenReparsePoint,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("CreateFileW locked shortcut %q: %w", name, err)
	}

	var attributes shortcutFileAttributeTagInfoBuffer
	ok, _, callErr := shortcutGetFileInformationByHandleEx.Call(
		uintptr(h),
		shortcutFileAttributeTagInfoClass,
		uintptr(unsafe.Pointer(&attributes)),
		unsafe.Sizeof(attributes),
	)
	if ok == 0 {
		_ = syscall.CloseHandle(h)
		return nil, shortcutWin32CallError("GetFileInformationByHandleEx(FileAttributeTagInfo)", callErr)
	}
	if attributes.FileAttributes&(shortcutFileAttributeDirectory|shortcutFileAttributeReparse) != 0 {
		_ = syscall.CloseHandle(h)
		return nil, fmt.Errorf("refusing directory or reparse-point shortcut: %s", name)
	}

	f := os.NewFile(uintptr(h), name)
	if f == nil {
		_ = syscall.CloseHandle(h)
		return nil, fmt.Errorf("failed to wrap shortcut handle: %s", name)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("stat locked shortcut %q: %w", name, err)
	}
	if !info.Mode().IsRegular() || info.Size() < 0 || info.Size() > shortcutMaxBytes {
		_ = f.Close()
		return nil, fmt.Errorf("refusing non-regular or oversized shortcut: %s", name)
	}
	return &lockedShortcutFile{file: f}, nil
}

func shortcutWin32CallError(operation string, callErr error) error {
	if callErr == nil || callErr == syscall.Errno(0) {
		return fmt.Errorf("%s failed without a Win32 error code", operation)
	}
	return fmt.Errorf("%s: %w", operation, callErr)
}

func (f *lockedShortcutFile) Close() error {
	if f == nil || f.file == nil {
		return nil
	}
	return f.file.Close()
}

func (f *lockedShortcutFile) SHA256() (string, error) {
	info, err := f.file.Stat()
	if err != nil {
		return "", err
	}
	if info.Size() < 0 || info.Size() > shortcutMaxBytes {
		return "", fmt.Errorf("shortcut exceeds %d bytes", shortcutMaxBytes)
	}
	if _, err := f.file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	h := sha256.New()
	if _, err := io.Copy(h, io.LimitReader(f.file, shortcutMaxBytes+1)); err != nil {
		return "", err
	}
	if _, err := f.file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// RenameNoReplace atomically renames the file represented by this handle.
// It never replaces an existing destination path.
func (f *lockedShortcutFile) RenameNoReplace(destination string) error {
	name, err := syscall.UTF16FromString(destination)
	if err != nil {
		return err
	}
	fieldOffset := unsafe.Offsetof(shortcutFileRenameInfoBuffer{}.FileName)
	nameBytes := (len(name) - 1) * 2 // FileNameLength excludes the terminating NUL.
	buffer := make([]byte, int(fieldOffset)+len(name)*2)
	info := (*shortcutFileRenameInfoBuffer)(unsafe.Pointer(&buffer[0]))
	info.ReplaceIfExists = 0
	info.RootDirectory = 0
	info.FileNameLength = uint32(nameBytes)
	copy(unsafe.Slice(&info.FileName[0], len(name)), name)

	ok, _, callErr := shortcutSetFileInformationByHandle.Call(
		f.file.Fd(),
		shortcutFileRenameInfoClass,
		uintptr(unsafe.Pointer(info)),
		uintptr(len(buffer)),
	)
	runtime.KeepAlive(buffer)
	if ok == 0 {
		return shortcutWin32CallError("SetFileInformationByHandle(FileRenameInfo, ReplaceIfExists=false)", callErr)
	}
	return nil
}

// DeleteByHandle marks the pinned file for deletion without reopening its path.
func (f *lockedShortcutFile) DeleteByHandle() error {
	info := shortcutFileDispositionInfoBuffer{DeleteFile: 1}
	ok, _, callErr := shortcutSetFileInformationByHandle.Call(
		f.file.Fd(),
		shortcutFileDispositionInfoClass,
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	runtime.KeepAlive(info)
	if ok == 0 {
		return shortcutWin32CallError("SetFileInformationByHandle(FileDispositionInfo)", callErr)
	}
	return nil
}

func validateShortcutMutationPaths(shortcut, backup, other string) error {
	paths := []string{shortcut, backup, other}
	for _, name := range paths {
		if !filepath.IsAbs(name) || filepath.Clean(name) != name || strings.TrimSpace(name) == "" {
			return fmt.Errorf("shortcut mutation paths must be clean absolute paths")
		}
		if !strings.EqualFold(filepath.Ext(name), ".lnk") {
			return fmt.Errorf("shortcut mutation path must end in .lnk")
		}
	}
	directory := filepath.Clean(filepath.Dir(shortcut))
	if !strings.EqualFold(directory, filepath.Clean(filepath.Dir(backup))) ||
		!strings.EqualFold(directory, filepath.Clean(filepath.Dir(other))) {
		return fmt.Errorf("shortcut, backup, and staging paths must share one directory")
	}
	if strings.EqualFold(shortcut, backup) || strings.EqualFold(shortcut, other) || strings.EqualFold(backup, other) {
		return fmt.Errorf("shortcut mutation paths must be distinct")
	}
	return nil
}

func validShortcutHash(value string) bool {
	if len(value) != 64 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

// commitShortcutHandleNoReplace moves the exact old file object to backup,
// then moves the exact verified staged object into the shortcut path. Both
// objects are held with write/delete sharing denied during the operation.
func commitShortcutHandleNoReplace(shortcut, backup, temporary, expectedOld, expectedNew string) error {
	if err := validateShortcutMutationPaths(shortcut, backup, temporary); err != nil {
		return err
	}
	if !validShortcutHash(expectedOld) || !validShortcutHash(expectedNew) {
		return fmt.Errorf("invalid expected shortcut SHA-256")
	}

	old, err := openLockedShortcutFile(shortcut)
	if err != nil {
		return fmt.Errorf("open current shortcut: %w", err)
	}
	defer old.Close()
	oldHash, err := old.SHA256()
	if err != nil {
		return fmt.Errorf("hash current shortcut handle: %w", err)
	}
	if oldHash != expectedOld {
		return fmt.Errorf("CURRENT_SHORTCUT_CHANGED_BEFORE_HANDLE_RENAME")
	}

	next, err := openLockedShortcutFile(temporary)
	if err != nil {
		return fmt.Errorf("open staged shortcut: %w", err)
	}
	defer next.Close()
	nextHash, err := next.SHA256()
	if err != nil {
		return fmt.Errorf("hash staged shortcut handle: %w", err)
	}
	if nextHash != expectedNew {
		return fmt.Errorf("STAGED_SHORTCUT_CHANGED_BEFORE_HANDLE_RENAME")
	}

	if err := old.RenameNoReplace(backup); err != nil {
		return fmt.Errorf("OLD_SHORTCUT_BACKUP_RENAME_FAILED: %w", err)
	}
	if err := next.RenameNoReplace(shortcut); err != nil {
		return fmt.Errorf("NEW_SHORTCUT_RENAME_FAILED; OLD_BACKUP_PRESERVED=%s: %w", backup, err)
	}
	installedHash, err := next.SHA256()
	if err != nil {
		return fmt.Errorf("verify installed shortcut handle: %w", err)
	}
	if installedHash != expectedNew {
		return fmt.Errorf("INSTALLED_SHORTCUT_HANDLE_HASH_MISMATCH")
	}
	return nil
}

func isShortcutPathMissing(err error) bool {
	return errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) || errors.Is(err, syscall.ERROR_PATH_NOT_FOUND)
}

func openLockedShortcutIfPresent(name string) (*lockedShortcutFile, error) {
	f, err := openLockedShortcutFile(name)
	if err != nil && isShortcutPathMissing(err) {
		return nil, nil
	}
	return f, err
}

// restoreShortcutHandleNoReplace restores only a hash-verified backup. If a
// user-created or user-modified shortcut occupies the destination, the restore
// fails without replacing it and leaves the backup/quarantine evidence intact.
func restoreShortcutHandleNoReplace(shortcut, backup, quarantine, expectedOld, expectedNew string) error {
	if err := validateShortcutMutationPaths(shortcut, backup, quarantine); err != nil {
		return err
	}
	if !validShortcutHash(expectedOld) || !validShortcutHash(expectedNew) {
		return fmt.Errorf("invalid expected shortcut SHA-256")
	}

	current, err := openLockedShortcutIfPresent(shortcut)
	if err != nil {
		return fmt.Errorf("open current shortcut for recovery: %w", err)
	}
	if current != nil {
		defer current.Close()
		currentHash, hashErr := current.SHA256()
		if hashErr != nil {
			return fmt.Errorf("hash current shortcut during recovery: %w", hashErr)
		}
		if currentHash == expectedOld {
			return nil // The original shortcut is already in place.
		}
		if currentHash != expectedNew {
			return fmt.Errorf("CURRENT_SHORTCUT_CHANGED_BY_USER")
		}
	}

	old, err := openLockedShortcutFile(backup)
	if err != nil {
		return fmt.Errorf("open old shortcut backup: %w", err)
	}
	defer old.Close()
	backupHash, err := old.SHA256()
	if err != nil {
		return fmt.Errorf("hash old shortcut backup: %w", err)
	}
	if backupHash != expectedOld {
		return fmt.Errorf("OLD_SHORTCUT_BACKUP_IDENTITY_CHANGED")
	}

	if current != nil {
		if err := current.RenameNoReplace(quarantine); err != nil {
			return fmt.Errorf("QUARANTINE_NEW_SHORTCUT_FAILED: %w", err)
		}
	}
	if err := old.RenameNoReplace(shortcut); err != nil {
		return fmt.Errorf("RESTORE_OLD_SHORTCUT_NO_REPLACE_FAILED; BACKUP_PRESERVED=%s: %w", backup, err)
	}
	if current != nil {
		if err := current.DeleteByHandle(); err != nil {
			return fmt.Errorf("OLD_SHORTCUT_RESTORED_BUT_QUARANTINE_RETAINED=%s: %w", quarantine, err)
		}
	}
	return nil
}

// deleteShortcutIfHash removes a file only when the opened file object matches
// the expected digest. It never deletes by a path-only check-then-use sequence.
func deleteShortcutIfHash(name, expectedHash string) error {
	if !filepath.IsAbs(name) || filepath.Clean(name) != name || !strings.EqualFold(filepath.Ext(name), ".lnk") {
		return fmt.Errorf("invalid shortcut cleanup path")
	}
	if !validShortcutHash(expectedHash) {
		return fmt.Errorf("invalid expected shortcut SHA-256")
	}
	f, err := openLockedShortcutIfPresent(name)
	if err != nil {
		return err
	}
	if f == nil {
		return nil
	}
	defer f.Close()
	actual, err := f.SHA256()
	if err != nil {
		return err
	}
	if actual != expectedHash {
		return fmt.Errorf("SHORTCUT_CLEANUP_IDENTITY_CHANGED")
	}
	return f.DeleteByHandle()
}