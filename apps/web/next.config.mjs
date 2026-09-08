const config={
  poweredByHeader:false,
  // Root `npm run typecheck` is the authoritative strict check. Next's worker
  // otherwise type-instantiates viem's generated ABI types until its depth limit.
  typescript:{ignoreBuildErrors:true},
  // The repository's TypeScript 5.9 compiler API is stable; using it avoids
  // Next 16's CLI --showConfig worker path producing an empty response.
  experimental:{useTypeScriptCli:false},
  turbopack:{},
  webpack(config){
    // Optional wallet/platform adapters are not part of XYX P0. Exclude them from the browser bundle.
    config.resolve.fallback={...(config.resolve.fallback??{}),
      '@react-native-async-storage/async-storage':false,
      '@farcaster/mini-app-solana':false,
      '@farcaster/quick-auth/decodeJwt':false,
      '@farcaster/quick-auth/light':false,
    };return config;
  },
  async rewrites(){return [{source:'/backend/:path*',destination:`${process.env.API_INTERNAL_URL??'http://127.0.0.1:3001'}/:path*`}];},
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]}];},
};
export default config;
