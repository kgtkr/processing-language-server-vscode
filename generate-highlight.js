const http = require("http");
const fs = require("fs");

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

(async () => {
  const keywordsTxt = fs.readFileSync("keywords.txt", { encoding: "utf8" });
  const patterns = keywordsTxt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.trim().split("\t"))
    .filter((line) => line.length >= 2)
    .map(([token, kind]) => {
      const name = {
        LITERAL2: "constant.other",
        KEYWORD1: "keyword.other",
        KEYWORD2: "keyword.other",
        KEYWORD3: "keyword.control",
        KEYWORD4: "keyword.other",
        KEYWORD5: "entity.name.type",
        KEYWORD6: "keyword.control",
        FUNCTION1: "entity.name.function",
        FUNCTION2: "entity.name.function",
        FUNCTION3: "keyword.control",
        FUNCTION4: "entity.name.function",
      }[kind];

      return name
        ? {
            match: `\\b(${escapeRegExp(token)})\\b`,
            captures: {
              1: {
                name,
              },
            },
          }
        : undefined;
    })
    .filter((line) => line);

  const result = JSON.stringify({
    name: "processing",
    patterns: [
      {
        match: `(//.*)`,
        captures: {
          1: {
            name: "comment.line",
          },
        },
      },
      {
        begin: `/\\*`,
        end: `\\*/`,
        name: "comment.block",
      },
      {
        match: `("((\\\\.)|[^"\\\\])*")`,
        captures: {
          1: {
            name: "string.quoted",
          },
        },
      },
      {
        match: `('((\\\\.)|[^'\\\\])')`,
        captures: {
          1: {
            name: "string.quoted",
          },
        },
      },
      {
        match: `(\\d+(\\.)?\\d*)`,
        captures: {
          1: {
            name: "constant.numeric",
          },
        },
      },
      ...patterns,
    ],
    scopeName: "source.pde",
  });

  fs.writeFileSync("./processing.tmLanguage.json", result);
})();
