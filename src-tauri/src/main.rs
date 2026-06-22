#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::path::PathBuf;

/// dweb — Decentralized Web Platform
///
/// Host full-stack web architectures locally, publish them globally via P2P,
/// and build with AI agents.
#[derive(Parser, Debug)]
#[command(name = "dweb", version, about)]
struct Args {
    /// Data directory for config, database, and identity files.
    /// Each instance must use a unique directory to avoid conflicts.
    /// Default: ~/.config/dweb (Linux/Mac) or %APPDATA%/dweb (Windows)
    #[arg(long)]
    data_dir: Option<PathBuf>,

    /// HTTP port for the Vite dev server frontend.
    /// Use a different port for each instance when running multiple locally.
    #[arg(long, default_value_t = 5173)]
    port: u16,

    /// Human-readable name for this instance (shown in P2P peer list).
    #[arg(long, default_value_t = String::new())]
    name: String,
}

fn main() {
    let args = Args::parse();

    // Use custom data dir, or default to ~/.config/dweb
    let data_dir = args.data_dir.unwrap_or_else(|| {
        dirs_next::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("dweb")
    });

    // Ensure the data directory exists
    std::fs::create_dir_all(&data_dir)
        .expect("Failed to create data directory");

    dweb_lib::run_with_args(
        data_dir,
        args.port,
        if args.name.is_empty() { None } else { Some(args.name) },
    );
}
