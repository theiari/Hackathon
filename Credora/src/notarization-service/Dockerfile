FROM rustlang/rust:nightly-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./

RUN mkdir src && \
    printf 'fn main() {}\n' > src/main.rs && \
    cargo build --release || true

RUN rm -rf src
COPY src ./src

RUN cargo build --release --bin notarization-service

FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/notarization-service /app/notarization-service
COPY trust_policy.json /app/trust_policy.json
COPY policy_governance.json /app/policy_governance.json
COPY onboarding_store.json /app/onboarding_store.json

WORKDIR /app

EXPOSE 8080

ENV RUST_LOG=info

CMD ["/app/notarization-service"]
