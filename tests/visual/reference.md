# Rendering reference

One example per Mermaid diagram type, plus math, code and tables. Used by the visual regression tests.

## flowchart

```mermaid
flowchart LR
  A[Start] --> B{Valid?}
  B -->|yes| C[Save]
  B -->|no| D[Reject]
```

## sequence

```mermaid
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: GET /doc
  S-->>U: 200 OK
```

## class

```mermaid
classDiagram
  class Doc {
    +String id
    +render() String
  }
  Doc <|-- StoredDoc
```

## state

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Shared: generate link
  Shared --> [*]
```

## er

```mermaid
erDiagram
  USER ||--o{ DOC : writes
  DOC {
    string id
    bytea content
  }
```

## user journey

```mermaid
journey
  title Sharing a document
  section Write
    Paste markdown: 5: Author
  section Share
    Copy link: 4: Author
    Open link: 5: Reader
```

## gantt

```mermaid
gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
    Core :a1, 2026-10-01, 7d
    UI   :after a1, 5d
```

## pie

```mermaid
pie title Diagram usage
  "Flowchart" : 45
  "Sequence" : 30
  "Other" : 25
```

## quadrant

```mermaid
quadrantChart
  title Effort vs impact
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  Theme toggle: [0.2, 0.6]
  Exports: [0.6, 0.8]
```

## requirement

```mermaid
requirementDiagram
  requirement share {
    id: 1
    text: Share by link
    risk: low
    verifymethod: test
  }
  element app {
    type: web
  }
  app - satisfies -> share
```

## gitgraph

```mermaid
gitGraph
  commit id: "init"
  branch feat
  commit id: "feature"
  checkout main
  merge feat id: "merge"
```

## c4

```mermaid
C4Context
  Person(user, "User")
  System(app, "rendermd")
  Rel(user, app, "Shares documents")
```

## mindmap

```mermaid
mindmap
  root((rendermd))
    Editor
    Reader
      TOC
      Exports
```

## timeline

```mermaid
timeline
  title Milestones
  2026-10 : Spec : Plan
  2026-11 : Launch
```

## zenuml

```mermaid
zenuml
  Alice->Bob: Hello
  Bob->Alice: Hi
```

## sankey

```mermaid
sankey

Visitors,Editor,60
Visitors,Reader,40
Editor,Shared,30
```

## xychart

```mermaid
xychart
  title "Links per day"
  x-axis [mon, tue, wed]
  y-axis "Links" 0 --> 50
  bar [10, 30, 45]
  line [10, 30, 45]
```

## block

```mermaid
block
  columns 3
  A["Editor"] B["Share"] C["Reader"]
```

## packet

```mermaid
packet
  0-15: "Source port"
  16-31: "Destination port"
```

## kanban

```mermaid
kanban
  todo[To do]
    t1[Write spec]
  done[Done]
    t2[Brainstorm]
```

## architecture

```mermaid
architecture-beta
  group site(cloud)[Site]
  service web(internet)[Pages] in site
  service db(database)[Supabase]
  web:R --> L:db
```

## radar

```mermaid
radar-beta
  axis a["Speed"], b["Privacy"], c["Cost"]
  curve r["rendermd"]{4, 5, 5}
  max 5
```

## treemap

```mermaid
treemap
"Bundle"
    "App": 30
    "Mermaid": 50
    "KaTeX": 20
```

## swimlane

```mermaid
swimlane-beta LR
  subgraph Author
    Write[Write]
    Share[Share]
  end
  subgraph Reader
    Open[Open link]
  end
  Write --> Share
  Share --> Open
```

## use case

```mermaid
usecase-beta
direction LR
actor Customer("Customer")
systemBoundary "Order system"
  Checkout("Place order")
end
Customer --> Checkout
```

## agentflow

```mermaid
agentflow-beta TB
  flow reviewer["Review Agent"]
    changes["Gather changes"]@{ shape: input }
    analyse["Analyse diff"]@{ shape: task }
    ok["Clean?"]@{ shape: decision }

    changes --> analyse --> ok
  end
```

## event modeling

```mermaid
eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded
```

## venn

```mermaid
venn-beta
  title Good feature
  set Desirable
  set Feasible
  union Desirable,Feasible["Buildable"]
```

## ishikawa

```mermaid
ishikawa-beta
    Blurry Photo
    Process
        Out of focus
    Equipment
        Dirty lens
```

## wardley

```mermaid
wardley-beta
title Tea Shop

anchor Business [0.95, 0.63]
component Tea [0.63, 0.81]
component Kettle [0.43, 0.35]

Business -> Tea
Tea -> Kettle
```

## cynefin

```mermaid
cynefin-beta
title Domains

complex
"Probe"

complicated
"Analyse"

clear
"Apply"

chaotic
"Act"

confusion
"Unknown"

complex --> complicated : "Pattern"
```

## tree view

```mermaid
treeView-beta
    rendermd/
        src/
            main.tsx
        package.json
```

## railroad

```mermaid
railroad-ebnf-beta
title "Digit"

digit = "0" | "1" | "2" ;
```

## math

Inline $e^{i\pi} + 1 = 0$ and display:

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$

## code

```ts
export function add(a: number, b: number): number {
  return a + b // sum
}
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}"
```

## table

| Type | Lazy | Size |
|---|:---:|---:|
| Mermaid | yes | large |
| KaTeX | yes | medium |

## tasks

- [x] Spec
- [ ] Launch
