FROM rust:1.77 as build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/notarization-service /app/notarization-service
EXPOSE 8080
CMD ["/app/notarization-service"]
