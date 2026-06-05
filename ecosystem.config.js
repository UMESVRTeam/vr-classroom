module.exports = {
    apps: [{
        name: "nsfvr-classroom",
        script: "./server.js",
        env: {
            NODE_ENV: "production",
            PORT: 3000, // Sit behind nginx/Caddy/Cloudflare in production for TLS termination on 443.
            TRUST_PROXY: 1,
            LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
            LIVEKIT_SECRET: process.env.LIVEKIT_SECRET,
            LIVEKIT_URL: 'wss://nsfvrclassroom-81g490x3.livekit.cloud'
        }
    }]
};