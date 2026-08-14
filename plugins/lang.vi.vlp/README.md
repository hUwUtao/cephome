# `lang.vi.vlp`

Vietnamese Amadeus language plugin. It is a guest-only bundle: the host owns
registration and dispatch, while this plugin supplies the public language and
post-pitch hooks.

```bash
# from cephome root
bun install
bun run build:amadeus-plugin
# → dist/amadeus-plugin/{plugin.iife.js,plugin.toml}
```

The output is a standalone QuickJS-safe IIFE. It bundles the public
`@amsvs/api` builder and the local Vietnamese planning implementation; it does
not read a sibling checkout, a host vendor directory, or a private
priority-modified semantic implementation at runtime.

To choose another release directory:

```bash
bun run scripts/build-amadeus-plugin.ts ./dist/releases/lang.vi.vlp
```

The generated `plugin.toml` contains the SHA-256 of the IIFE. The host must
load its public `__plugin` registration function before evaluating the bundle.

Release check:

```bash
bun test plugins/lang.vi.vlp/tone-graph.test.ts
```

This test loads the local plugin source through a small public registration
harness and verifies the pure tone graph. Host-kernel integration remains the
host's responsibility.

Uses amsvs builder API:

```ts
plugin("lang.vi.vlp")
  .params(
    { showPhoneSplits: param.boolean({…}) },
    { label: "Vietnamese phonetics", stages: ["plan", "timing"] },
  )
  .params(
    {
      toneWeight: param.number({ default: 50, min: 0, max: 120 }), // cents peak delta
      nonlinear: param.boolean({ default: true }),
      peakEase: param.number({ default: 50, min: 0, max: 100 }),
      valleyTime: param.number({ default: 55, min: 5, max: 95 }), // hỏi valley %
      offtoneCompensation: param.number({ default: 0, min: 0, max: 100 }),
    },
    { label: "Vietnamese tonal field", stages: ["pitch"] },
  )
  // Pure delta only: f0 *= 2^(deltaCents/1200). Rise/fall/dip graphs; no model compression.

  .hooks({ role: "language", plan, finalize })
  .member("tone", (b) => b.hooks({ stage: "post_pitch", postPitch }))
  .register();
```

Each `.params()` call is one inspector group. `stages` filters Plan vs Pitch
surfaces; multi-call keys merge into one typed `this.params` bag.

The source imports only the published `@amsvs/api` package. Keep the plugin
source and its generated manifest in this repository; do not copy a host
vendor artifact into the source tree.
