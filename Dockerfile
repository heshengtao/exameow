# Stage 1: Chef base (with cargo-chef preinstalled)
FROM lukemathwalker/cargo-chef:latest-rust-1-alpine AS chef
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache musl-dev perl || { \
      sed -i 's/mirrors.tuna.tsinghua.edu.cn/dl-cdn.alpinelinux.org/g' /etc/apk/repositories && \
      apk add --no-cache musl-dev perl; \
    }
RUN mkdir -p /root/.cargo
RUN <<CARGO_CONFIG cat > /root/.cargo/config.toml
[registries.crates-io]
protocol = "sparse"

[source.crates-io]
replace-with = "tuna"

[source.tuna]
registry = "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/"
CARGO_CONFIG
ENV CARGO_HOME=/root/.cargo
WORKDIR /app

# Stage 2: Plan — compute dependency recipe (only changes when manifests change)
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY packages/mcp/ packages/mcp/
COPY packages/cli/ packages/cli/
RUN sed -i '/src-tauri/d; /plugins\/screenrecord/d' Cargo.toml
RUN cargo chef prepare --recipe-path recipe.json

# Stage 3: Build — cook dependencies first (cached layer), then build our crates
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json -p exameow-server
COPY Cargo.toml Cargo.lock ./
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY packages/mcp/ packages/mcp/
COPY packages/cli/ packages/cli/
RUN sed -i '/src-tauri/d; /plugins\/screenrecord/d' Cargo.toml
RUN cargo build --release -p exameow-server

# Stage 4: Runtime
FROM alpine:3.21
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache ca-certificates || { \
      sed -i 's/mirrors.tuna.tsinghua.edu.cn/dl-cdn.alpinelinux.org/g' /etc/apk/repositories && \
      apk add --no-cache ca-certificates; \
    }

COPY --from=builder /app/target/release/exameow-server /app/server
COPY frontend/dist /app/static
WORKDIR /app

RUN mkdir -p /app/.config
ENV HOME=/app
ENV STATIC_DIR=/app/static
ENV PORT=3000
ENV RUST_LOG=info

EXPOSE 3000
CMD ["./server"]
