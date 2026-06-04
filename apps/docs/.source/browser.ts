// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"architecture.mdx": () => import("../content/docs/architecture.mdx?collection=docs"), "circles.mdx": () => import("../content/docs/circles.mdx?collection=docs"), "concepts.mdx": () => import("../content/docs/concepts.mdx?collection=docs"), "gate.mdx": () => import("../content/docs/gate.mdx?collection=docs"), "getting-started.mdx": () => import("../content/docs/getting-started.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "memory.mdx": () => import("../content/docs/memory.mdx?collection=docs"), "plugins.mdx": () => import("../content/docs/plugins.mdx?collection=docs"), "production.mdx": () => import("../content/docs/production.mdx?collection=docs"), "providers.mdx": () => import("../content/docs/providers.mdx?collection=docs"), "safety.mdx": () => import("../content/docs/safety.mdx?collection=docs"), "templates.mdx": () => import("../content/docs/templates.mdx?collection=docs"), }),
};
export default browserCollections;