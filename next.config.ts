const { version } = require('./package.json');
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    env: {
        version,
        buildTime: new Date().toISOString(),
    }
};

export default nextConfig;