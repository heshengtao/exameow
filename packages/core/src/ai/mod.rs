mod chat;
mod client;
mod models;
mod options;
mod tool_loop;

pub use chat::{
    chat, ChatEvent, ChatMessage, ChatResult, FunctionCall, FunctionDefinition, ToolCall,
    ToolDefinition,
};
pub use client::{AIClient, ChatStreamChunk};
pub use models::ModelInfo;
pub use options::AIRequestOptions;
pub use tool_loop::{
    chat_tool_loop_stream, tool_definitions, ChatToolConfig, FetchToolConfig, SearchToolConfig,
};
