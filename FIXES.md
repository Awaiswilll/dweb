# Fix Log — Windows / Tauri v2 Build + Security Fixes

This documents the changes made to get `dweb` compiling on Windows with Tauri v2
and current Rust stable, plus two follow-up security/architecture fixes found
during a post-build review.

## Build fixes — 9 compile errors

### 1. `src-tauri/src/p2p.rs` — `shutdown()` couldn't await a borrowed `JoinHandle`

```rust
// Before
pub async fn shutdown(&self) {
    for handle in &self.task_handles { handle.abort(); }
    for handle in &self.task_handles { let _ = handle.await; }   // E0277: &JoinHandle is not a Future
    log::info!("P2P manager: {} background task(s) aborted", self.task_handles.len());
}

// After
pub async fn shutdown(&mut self) {
    for handle in &self.task_handles { handle.abort(); }
    let count = self.task_handles.len();
    for handle in self.task_handles.drain(..) { let _ = handle.await; }   // owned handles
    log::info!("P2P manager: {} background task(s) aborted", count);
}
```

Tokio's `JoinHandle` only implements `Future` when owned, not by reference.
`shutdown` now takes `&mut self` so it can `drain()` the vec into owned handles.
(Sole caller in `p2p.rs::init` updated to bind `mut old`.)

### 2. `src-tauri/src/stack.rs` — `child` not declared mutable

```rust
// Before
let (pid, child) = spawned?;
...
let _ = child.wait().await;   // E0596: cannot borrow as mutable

// After
let (pid, mut child) = spawned?;
```

`Child::wait()` requires `&mut self` to poll for exit.

### 3. `src-tauri/src/stack.rs` (×4 — Node.js/Python/PHP/Ruby handlers) — `Child::id()` returns `Option<u32>`

```rust
// Before
let pid = child.id();
Ok(SpawnedProcess { pid, child })   // E0308: expected u32, found Option<u32>

// After
let pid = child.id().ok_or("Node.js process exited before PID could be read")?;
Ok(SpawnedProcess { pid, child })
```

`Child::id()` returns `None` if the process has already been reaped; unwrapped
via `.ok_or(...)?` into a proper error, matching this function's existing
error style, instead of `.expect()` panicking.

### 4. `src-tauri/src/cloud.rs` — dangling temporary borrow

```rust
// Before
let site_url = data["ssl_url"].as_str()
    .or_else(|| data["url"].as_str())
    .unwrap_or(&format!("https://{}.netlify.app", domain));   // E0716: temporary dropped while borrowed

// After
let site_url = data["ssl_url"].as_str()
    .or_else(|| data["url"].as_str())
    .map(|s| s.to_string())
    .unwrap_or_else(|| format!("https://{}.netlify.app", domain));   // owned String
```

`unwrap_or(&format!(...))` borrowed a `String` temporary that got dropped at
the end of the statement while `site_url` was still used later. Rewritten to
produce an owned `String` throughout (also makes the fallback lazy).

### 5. `src-tauri/src/config.rs` — missing `sha2::Digest` trait import

```rust
// Before
let hash = sha2::Sha256::digest(seed.as_bytes());   // E0599: digest() needs sha2::Digest in scope

// After
use sha2::Digest;   // added at top of file
```

### 6. `src-tauri/src/config.rs` — `&&str` vs `Borrow<str>`

```rust
// Before
for field in &["aws_access_key", "aws_secret_key", "netlify_token", "vercel_token"] {
    providers.get_mut(field)   // E0277: field is &&str, String: Borrow<&str> not satisfied
}

// After
for field in ["aws_access_key", "aws_secret_key", "netlify_token", "vercel_token"] {
    providers.get_mut(field)   // field is &str
}
```

Iterating `&[...]` produced a double reference (`&&str`); dropping the outer
`&` iterates by value, giving `&str` and satisfying `String: Borrow<str>`.

## Security / architecture fixes (post-build review)

### 7. `src-tauri/src/sandbox.rs` + `src-tauri/src/p2p.rs` — P2P identity wasn't real or persistent

```rust
// Before (sandbox.rs) — public/secret generated independently of each other
let mut secret = [0u8; 32]; let mut public = [0u8; 32];
rng.fill(&mut secret); rng.fill(&mut public);   // public isn't derived from secret at all

// Before (p2p.rs)
keypair: Keypair::default(),   // brand-new random keypair on every single launch

// After (sandbox.rs) — public key is a real ed25519 derivation from the seed
let keypair = hyperdht::Keypair::from_seed(seed);
public_key: hex::encode(&keypair.public[..]),
secret_key: hex::encode(seed),
// + load_or_create() self-heals any existing identity.json with a mismatched pair

// After (p2p.rs) — loads the persisted identity instead of randomizing every launch
let identity = crate::sandbox::InstanceIdentity::load_or_create(data_dir);
let keypair = identity.derive_keypair().unwrap_or_default();
```

Every app restart previously generated a brand-new random DHT identity, so a
node's public key — and therefore domain "ownership" — wasn't stable across
restarts. Now the DHT keypair is deterministically derived from the persisted
per-instance identity seed, so it survives restarts. Verified live: killing
and relaunching the built binary leaves `identity.json` byte-identical.

### 8. `src-tauri/src/git.rs` + `src-tauri/src/github.rs` — GitHub token leaked into `.git/config`

```rust
// Before (github.rs)
let auth_url = clone_url.replace("https://", &format!("https://x-access-token:{}@", token));
crate::git::clone_repo(&auth_url, dest_path)
// git persists this URL — including the token — into the cloned repo's
// .git/config in plaintext, outliving the token's intended lifetime.

// After (git.rs) — new function, token passed as an in-memory credential
pub fn clone_repo_with_token(url: &str, path: &Path, token: &str) -> Result<RepoInfo, String> {
    ...
    cb.credentials(move |_url, _username_from_url, _allowed_types| {
        git2::Cred::userpass_plaintext("x-access-token", &token)
    });
    ...
}

// After (github.rs)
crate::git::clone_repo_with_token(clone_url, dest_path, &token)
```

The existing unauthenticated `clone_repo(url, path)` path is unchanged.
