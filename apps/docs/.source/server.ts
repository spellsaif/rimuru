// @ts-nocheck
import * as __fd_glob_12 from "../content/docs/templates.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/safety.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/providers.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/production.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/plugins.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/memory.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/getting-started.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/gate.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/concepts.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/circles.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/architecture.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"architecture.mdx": __fd_glob_1, "circles.mdx": __fd_glob_2, "concepts.mdx": __fd_glob_3, "gate.mdx": __fd_glob_4, "getting-started.mdx": __fd_glob_5, "index.mdx": __fd_glob_6, "memory.mdx": __fd_glob_7, "plugins.mdx": __fd_glob_8, "production.mdx": __fd_glob_9, "providers.mdx": __fd_glob_10, "safety.mdx": __fd_glob_11, "templates.mdx": __fd_glob_12, });