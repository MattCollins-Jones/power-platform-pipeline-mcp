const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp");
const { z } = require("zod");

const s = new McpServer({name:"test",version:"1.0"});
console.log("methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(s)));

// Register a tool
s.tool("test_tool", "A test tool", {msg: z.string()}, async (args) => ({ content: [{type:"text",text:"ok"}] }));
console.log("Tool registered OK - internal keys:", Object.keys(s));

// Connect to a transport and send tools/list
const http = require("http");
const express = require("express");
const { randomUUID } = require("crypto");
const app = express();
app.use(express.json());

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
s.connect(transport).then(() => {
  console.log("Connected OK");
  const server = http.createServer(app);
  app.post("/mcp", async (req,res) => { await transport.handleRequest(req,res,req.body); });
  server.listen(9999, async () => {
    // Send initialize then tools/list
    const http2 = require("http");
    const body = JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"test",version:"1"}}});
    const req2 = http2.request({hostname:"localhost",port:9999,path:"/mcp",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}}, (res2) => {
      let data=""; const sid = res2.headers["mcp-session-id"];
      res2.on("data",d=>data+=d);
      res2.on("end",()=>{
        console.log("Init response:", data);
        console.log("Session ID:", sid);
        const body2 = JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list",params:{}});
        const req3 = http2.request({hostname:"localhost",port:9999,path:"/mcp",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body2),"mcp-session-id":sid}}, (res3) => {
          let d2="";
          res3.on("data",d=>d2+=d);
          res3.on("end",()=>{ console.log("Tools list:", d2); process.exit(0); });
        });
        req3.write(body2); req3.end();
      });
    });
    req2.write(body); req2.end();
  });
});
