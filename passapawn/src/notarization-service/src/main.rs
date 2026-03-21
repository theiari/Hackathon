mod config;
mod client;
mod model;
mod dto;
mod error;
mod locked_impl;
mod dynamic_impl;
mod verify_impl;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

use crate::client::NotarizationService;
use crate::config::NotarizationConfig;
use crate::dynamic_impl::{create_dynamic, transfer_dynamic, update_dynamic_metadata, update_dynamic_state};
use crate::locked_impl::create_locked;
use crate::verify_impl::verify_notarization;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) service: Arc<NotarizationService>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = NotarizationConfig::from_env();
    let bind_addr = cfg.bind_addr.clone();

    // 2. Instantiate service
    let service = NotarizationService::new(cfg).await?;
    let state = AppState {
        service: Arc::new(service),
    };

    // 3. Define routes
    let app = Router::new()
        .route("/health", get(health_check))
        // Locked
        .route("/notarizations/locked", post(create_locked))
        // Dynamic
        .route("/notarizations/dynamic", post(create_dynamic))
        .route(
            "/notarizations/dynamic/:id/state",
            post(update_dynamic_state),
        )
        .route(
            "/notarizations/dynamic/:id/metadata",
            post(update_dynamic_metadata),
        )
        .route(
            "/notarizations/dynamic/:id/transfer",
            post(transfer_dynamic),
        )
        // Verify (works for both Locked & Dynamic)
        .route("/notarizations/:id/verify", post(verify_notarization))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    // 4. Start HTTP server
    let listener = TcpListener::bind(&bind_addr).await?;
    println!("Listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}
