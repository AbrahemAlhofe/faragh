const { version } = require('./package.json');
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    env: {
        version
    }
};

export default nextConfig;