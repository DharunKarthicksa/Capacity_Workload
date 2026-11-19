"""Convert the static design screens (docs/design/screens/*.dc.html) into React sample screens.

  python scripts/design_to_tsx.py

Writes packages/ui/src/screens/sample/<Name>.tsx (one per screen) and index.ts. Each file exports the
screen's main content and its sample data-agent conversation. Colors become CSS variables (--ci-*) so the
screens follow the light and dark themes. The output is generated: change the design file or this script,
then re-run. Standard library only.
"""
import json
import os
import re
from html.parser import HTMLParser

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "docs", "design", "screens")
OUT = os.path.join(ROOT, "packages", "ui", "src", "screens", "sample")

# design file stem -> (route key, component name, design link name)
SCREENS = [
    ("all-capacities", "AllCapacities", "Estate"),
    ("overview", "Overview", "Main"),
    ("anomalies", "Anomalies", "Investigate"),
    ("throttling", "Throttling", "Headroom"),
    ("workspaces", "Workspaces", "Workspaces"),
    ("model-health", "ModelHealth", "ModelHealth"),
    ("rebalance", "Rebalance", "Rebalance"),
    ("alerts-settings", "AlertsSettings", "Alerts"),
]
LINKS = {link: key for key, _, link in SCREENS}

COLORS = {
    "#242424": "text", "#5C5C5C": "muted", "#FFFFFF": "surface", "#F5F5F5": "page", "#F7F7F7": "subtle",
    "#F0F0F0": "neutral", "#EDEDED": "border-subtle", "#E0E0E0": "border", "#0F6CBD": "brand",
    "#0B4F8C": "brand-strong", "#EBF3FC": "brand-bg", "#117865": "teal", "#E8F4F1": "teal-bg",
    "#0E700E": "success", "#F1FAF1": "success-bg", "#8A3707": "warn-text", "#C2500A": "warn",
    "#FFF4E5": "warn-bg", "#F4C9A3": "warn-border", "#B10E1C": "danger", "#FDE7E9": "danger-bg",
}
UNKNOWN_COLORS = set()

ATTRS = {
    "for": "htmlFor", "class": "className", "sc-camel-view-box": "viewBox", "tabindex": "tabIndex",
    "colspan": "colSpan", "rowspan": "rowSpan", "readonly": "readOnly", "value": "defaultValue",
    "checked": "defaultChecked", "maxlength": "maxLength", "autocomplete": "autoComplete",
}
VOID = {"input", "br", "img", "hr", "meta"}
NO_WS = {"table", "thead", "tbody", "tfoot", "tr", "select", "ul", "ol", "svg", "g", "colgroup"}


def color(value, prop=""):
    def sub(m):
        hx = m.group(0).upper()
        if hx == "#FFFFFF" and prop == "color":
            return "var(--ci-on-brand)"
        name = COLORS.get(hx)
        if not name:
            UNKNOWN_COLORS.add(hx)
            return m.group(0)
        return f"var(--ci-{name})"
    return re.sub(r"#[0-9A-Fa-f]{6}\b", sub, value)


def camel(name):
    return re.sub(r"-([a-z])", lambda m: m.group(1).upper(), name)


class Node:
    def __init__(self, tag, attrs):
        self.tag, self.attrs, self.children = tag, attrs, []

    def text(self):
        return "".join(c if isinstance(c, str) else c.text() for c in self.children)

    def find(self, pred):
        for c in self.children:
            if isinstance(c, Node):
                if pred(c):
                    return c
                r = c.find(pred)
                if r:
                    return r
        return None

    def find_all(self, pred, acc=None):
        acc = [] if acc is None else acc
        for c in self.children:
            if isinstance(c, Node):
                if pred(c):
                    acc.append(c)
                c.find_all(pred, acc)
        return acc


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [])
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs)
        self.stack[-1].children.append(n)
        if tag not in VOID:
            self.stack.append(n)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data.replace("�", "·"))


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


def style_obj(css):
    parts = []
    for decl in css.split(";"):
        if ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        k, v = k.strip(), v.strip()
        key = k if k.startswith("--") else camel(k)
        key = key if re.match(r"^[A-Za-z_]\w*$", key) else json.dumps(key)
        parts.append(f"{key}: {json.dumps(color(v, k), ensure_ascii=False)}")
    return "{{ " + ", ".join(parts) + " }}"


def attr_str(tag, attrs):
    out = []
    for name, value in attrs:
        if name in ("data-dc-script", "data-props"):
            continue
        if name == "style":
            out.append("style=" + style_obj(value or ""))
            continue
        if name == "href" and value:
            m = re.match(r"^(\w+)\.dc\.html", value)
            value = "#/" + LINKS[m.group(1)] if m and m.group(1) in LINKS else value
        jsx = ATTRS.get(name)
        if jsx is None:
            jsx = name if name.startswith(("aria-", "data-")) or "-" not in name else camel(name)
        if name == "selected":
            continue
        if value is None or (value == "" and name in ("checked", "disabled", "readonly", "hidden", "required")):
            out.append(jsx)
        else:
            if name in ("fill", "stroke"):
                value = color(value)
            out.append(f"{jsx}={{{json.dumps(value, ensure_ascii=False)}}}")
    return (" " + " ".join(out)) if out else ""


def emit(node, depth, parent_tag=""):
    pad = "  " * depth
    if isinstance(node, str):
        if not node.strip():
            if "\n" in node or parent_tag in NO_WS or not node:
                return ""
            return pad + '{" "}\n'
        s = re.sub(r"\s+", " ", node)
        return pad + "{" + json.dumps(s, ensure_ascii=False) + "}\n"
    tag = node.tag[len("sc-raw-"):] if node.tag.startswith("sc-raw-") else node.tag
    a = attr_str(tag, node.attrs)
    if tag in VOID or not node.children:
        return f"{pad}<{tag}{a} />\n"
    inner = "".join(emit(c, depth + 1, tag) for c in node.children)
    return f"{pad}<{tag}{a}>\n{inner}{pad}</{tag}>\n"


def convert(stem, key, comp):
    with open(os.path.join(SRC, stem + ".dc.html"), encoding="utf-8") as f:
        t = Tree()
        t.feed(f.read())
    main = t.root.find(lambda n: n.tag == "main")
    aside = t.root.find(lambda n: n.tag == "aside")
    title = clean(main.find(lambda n: n.tag == "h1").text())

    convo = [c for c in aside.children if isinstance(c, Node)][1]
    blocks = [c for c in convo.children if isinstance(c, Node)]
    context = clean(blocks[0].text())
    question = clean(blocks[1].text())
    answer = blocks[2]
    suggestions = [clean(b.text()) for b in blocks[3].find_all(lambda n: n.tag == "button")]
    inp = aside.find(lambda n: n.tag == "input")
    placeholder = dict(inp.attrs).get("placeholder", "") if inp else ""

    main_jsx = "".join(emit(c, 3) for c in main.children)
    answer_jsx = "".join(emit(c, 3) for c in answer.children)
    agent = json.dumps({"context": context, "question": question, "suggestions": suggestions, "placeholder": placeholder},
                       ensure_ascii=False, indent=2)
    body = f"""// GENERATED by scripts/design_to_tsx.py from docs/design/screens/{stem}.dc.html. Do not edit by hand.
import type {{ ReactElement }} from "react";
import type {{ SampleScreen }} from "./types";

function Main(): ReactElement {{
  return (
    <>
{main_jsx}    </>
  );
}}

function Answer(): ReactElement {{
  return (
    <>
{answer_jsx}    </>
  );
}}

export const {comp[0].lower() + comp[1:]}: SampleScreen = {{
  key: {json.dumps(key)},
  title: {json.dumps(title, ensure_ascii=False)},
  Main,
  agent: {{ ...{agent}, Answer }},
}};
"""
    with open(os.path.join(OUT, comp + ".tsx"), "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print(f"  {comp}.tsx  title={title!r}  suggestions={len(suggestions)}  question={question[:40]!r}")


def main():
    os.makedirs(OUT, exist_ok=True)
    for stem, comp, _ in SCREENS:
        convert(stem, stem, comp)
    names = [c[0].lower() + c[1:] for _, c, _ in SCREENS]
    lines = ["// GENERATED by scripts/design_to_tsx.py. Do not edit by hand."]
    lines += [f'import {{ {n} }} from "./{c}";' for n, (_, c, _) in zip(names, SCREENS)]
    lines += ['import type { SampleScreen } from "./types";', "",
              "/** Sample screens in navigation order. */",
              f"export const sampleScreens: SampleScreen[] = [{', '.join(names)}];", ""]
    with open(os.path.join(OUT, "index.ts"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    if UNKNOWN_COLORS:
        print("colors without a token (left as hex):", sorted(UNKNOWN_COLORS))


if __name__ == "__main__":
    main()
