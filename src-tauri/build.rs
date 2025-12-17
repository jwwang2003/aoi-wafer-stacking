fn main() {
    // Only embed libtorch rpath when the libtorch feature is enabled.
    if std::env::var("CARGO_FEATURE_LIBTORCH").is_ok() {
        if let Ok(libtorch_root) = std::env::var("LIBTORCH") {
            let trimmed = libtorch_root.trim_end_matches('/');
            let rpath = format!("{}/lib", trimmed);
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", rpath);
            println!("cargo:warning=Embedding libtorch rpath: {}", rpath);
        }
    }

    tauri_build::build()
}
