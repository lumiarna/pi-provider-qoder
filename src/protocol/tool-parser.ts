export interface ParsedToolCall {
  name: string;
  arguments: Record<string, any>;
}

export function parseToolCallsFromText(text: string): {
  cleanText: string;
  toolCalls: ParsedToolCall[];
} {
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  const toolCalls: ParsedToolCall[] = [];

  let match: RegExpExecArray | null;
  while ((match = toolCallRegex.exec(text)) !== null) {
    let rawContent = match[1].trim();
    let name = "";
    let args: Record<string, any> = {};

    // Strip markdown code block fences if present (e.g. ```json ... ```)
    if (rawContent.startsWith("```")) {
      rawContent = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }

    if (rawContent.startsWith("{") && rawContent.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawContent);
        name = parsed.name || parsed.function || parsed.tool || "";
        args = parsed.arguments || parsed.parameters || parsed.args || {};
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {}
        }
      } catch {}
    } else {
      const funcMatch =
        /<(?:function|invoke)(?:\s+name=|=|\s+)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/(?:function|invoke)>|$)/i.exec(
          rawContent,
        );
      if (funcMatch) {
        name = funcMatch[1];
        const paramsBlock = funcMatch[2];
        const paramRegex = /<parameter(?:\s+name=|=|\s+)["']?([a-zA-Z0-9_\-]+)["']?>([\s\S]*?)<\/parameter>/gi;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = paramRegex.exec(paramsBlock)) !== null) {
          const pName = pMatch[1];
          let pVal: any = pMatch[2].trim();
          if ((pVal.startsWith("{") && pVal.endsWith("}")) || (pVal.startsWith("[") && pVal.endsWith("]"))) {
            try {
              pVal = JSON.parse(pVal);
            } catch {}
          } else if (pVal === "true") {
            pVal = true;
          } else if (pVal === "false") {
            pVal = false;
          } else if (/^-?\d+(\.\d+)?$/.test(pVal)) {
            pVal = Number(pVal);
          }
          args[pName] = pVal;
        }
      }
    }

    if (name) {
      // Normalize common parameter aliases for built-in tools
      if ((name === "read" || name === "write" || name === "edit") && !args.path) {
        if (args.file_path) args.path = args.file_path;
        else if (args.filePath) args.path = args.filePath;
      }
      if (name === "bash" && !args.command && args.cmd) {
        args.command = args.cmd;
      }
      toolCalls.push({ name, arguments: args });
    }
  }

  const cleanText = text.replace(toolCallRegex, "").trim();
  return { cleanText, toolCalls };
}
