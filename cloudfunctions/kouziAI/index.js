// 云函数入口文件
const cloud = require('wx-server-sdk')
const request = require('request-promise')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  const { message, conversationId, toolOutputs } = event;
  
  try {
    // 如果提供了工具输出，则处理工具调用响应
    if (toolOutputs) {
      return await handleToolOutputs(toolOutputs);
    }
    
    // 否则，发起新对话
    return await startNewChat(message, conversationId);
  } catch (error) {
    console.error('调用扣子API出错:', error);
    return {
      success: false,
      error: error.message || '请求失败'
    };
  }
};

// 处理工具输出
async function handleToolOutputs(toolOutputData) {
  // 这里实现工具输出的处理逻辑
  // 实际应用中需要根据具体工具类型进行处理
  console.log("处理工具输出:", toolOutputData);
  
  try {
    // 提交工具输出结果到扣子平台
    const result = await request({
      method: 'POST',
      url: `https://api.coze.cn/v3/chat/${toolOutputData.chatId}/tool_outputs`,
      headers: {
        'Authorization': 'Bearer pat_EGgVgPfBhbaBiOmLJSDTaaNyasaolK4RQwwRDQUfHsvJ5gpp76QktN8XTKLZqGCZ',
        'Content-Type': 'application/json'
      },
      body: {
        tool_outputs: toolOutputData.outputs
      },
      json: true
    });
    
    // 工具输出提交后，继续轮询获取对话结果
    return await pollChatResult(toolOutputData.chatId, toolOutputData.conversationId);
  } catch (error) {
    console.error('提交工具输出失败:', error);
    throw error;
  }
}

// 发起新对话
async function startNewChat(message, conversationId) {
  console.log("开始发起对话请求");
  const initResult = await request({
    method: 'POST',
    url: 'https://api.coze.cn/v3/chat',
    headers: {
      'Authorization': 'Bearer pat_EGgVgPfBhbaBiOmLJSDTaaNyasaolK4RQwwRDQUfHsvJ5gpp76QktN8XTKLZqGCZ',
      'Content-Type': 'application/json'
    },
    body: {
      "bot_id": "7469612631767498778",
      "user_id": "123",
      "conversation_id": conversationId,
      "messages": [{ 
        "role": "user", 
        "content": message 
      }]
    },
    json: true
  });
  
  console.log("对话请求响应:", JSON.stringify(initResult));
  
  // 获取响应ID和会话ID
  const chatId = initResult.data.id;
  const newConversationId = initResult.data.conversation_id;
  
  console.log(`获取到会话ID: ${newConversationId}, 聊天ID: ${chatId}`);
  
  // 检查是否需要额外操作
  if (initResult.data.status === 'requires_action') {
    console.log("检测到需要额外操作:", initResult.data.required_action);
    
    // 返回需要进行工具调用的信息
    return {
      success: true,
      requiresAction: true,
      data: {
        conversationId: newConversationId,
        chatId: chatId,
        requiredAction: initResult.data.required_action,
        actionType: initResult.data.required_action.type,
        toolCalls: initResult.data.required_action.submit_tool_outputs?.tool_calls || []
      }
    };
  }
  
  // 如果不需要额外操作，则继续轮询获取结果
  return await pollChatResult(chatId, newConversationId);
}

// 轮询获取对话结果
async function pollChatResult(chatId, conversationId) {
  // 第二步：轮询获取结果
  let attempts = 0;
  let maxAttempts = 30;
  let messages = [];
  let chatStatus = 'created';
  let isCompleted = false;
  
  console.log("开始轮询获取结果");
  
  while (attempts < maxAttempts && !isCompleted) {
    // 等待1秒
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 获取聊天状态
    const statusResult = await request({
      method: 'GET',
      url: `https://api.coze.cn/v3/chat/${chatId}`,
      headers: {
        'Authorization': 'Bearer pat_EGgVgPfBhbaBiOmLJSDTaaNyasaolK4RQwwRDQUfHsvJ5gpp76QktN8XTKLZqGCZ'
      },
      json: true
    });
    
    console.log(`轮询第${attempts+1}次, 聊天状态: ${statusResult.data.status}`);
    chatStatus = statusResult.data.status;
    
    // 检查是否需要额外操作
    if (chatStatus === 'requires_action') {
      console.log("检测到需要额外操作:", statusResult.data.required_action);
      
      // 返回需要进行工具调用的信息
      return {
        success: true,
        requiresAction: true,
        data: {
          conversationId: conversationId,
          chatId: chatId,
          requiredAction: statusResult.data.required_action,
          actionType: statusResult.data.required_action.type,
          toolCalls: statusResult.data.required_action.submit_tool_outputs?.tool_calls || []
        }
      };
    }
    
    // 处理消息
    if (statusResult.data && statusResult.data.messages) {
      for (const msg of statusResult.data.messages) {
        // 跳过用户消息
        if (msg.role === 'user') continue;
        
        // 查找是否已存在此消息
        const existingMsgIndex = messages.findIndex(m => m.id === msg.id);
        
        // 处理各种类型的消息
        if (existingMsgIndex < 0) { // 只处理新消息
          if (msg.type === 'answer' && msg.content_type === 'text') {
            messages.push({
              id: msg.id,
              type: 'text',
              content: msg.content || '',
              completed: true
            });
          }
          else if (msg.type === 'answer' && msg.content_type === 'card') {
            try {
              const cardContent = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              messages.push({
                id: msg.id,
                type: 'card',
                content: cardContent,
                completed: true
              });
            } catch (e) {
              console.error('解析卡片内容失败:', e);
              messages.push({
                id: msg.id,
                type: 'card',
                content: msg.content,
                parseError: true
              });
            }
          }
          else if (msg.type === 'knowledge') {
            messages.push({
              id: msg.id,
              type: 'knowledge',
              content: msg.content
            });
          }
          else if (msg.type === 'function_call') {
            try {
              const functionContent = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              messages.push({
                id: msg.id,
                type: 'function_call',
                content: functionContent
              });
            } catch (e) {
              console.error('解析函数调用内容失败:', e);
            }
          }
          else if (msg.type === 'tool_output') {
            messages.push({
              id: msg.id,
              type: 'tool_output',
              content: msg.content,
              contentType: msg.content_type
            });
          }
          else if (msg.type === 'follow_up') {
            messages.push({
              id: msg.id,
              type: 'suggestion',
              content: msg.content
            });
          }
          else if (msg.type === 'verbose') {
            try {
              const verboseContent = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              if (verboseContent.msg_type === 'generate_answer_finish') {
                console.log("检测到generate_answer_finish标记");
              }
              
              messages.push({
                id: msg.id,
                type: 'verbose',
                msgType: verboseContent.msg_type || 'unknown',
                content: verboseContent
              });
            } catch (e) {
              console.error('解析verbose内容失败:', e);
            }
          }
          else {
            messages.push({
              id: msg.id,
              type: msg.type,
              contentType: msg.content_type,
              content: msg.content
            });
          }
        }
      }
    }
    
    // 检查聊天是否完成
    if (chatStatus === 'completed') {
      console.log("聊天已完成");
      isCompleted = true;
    } else if (chatStatus === 'failed') {
      const errorMsg = statusResult.data.last_error && statusResult.data.last_error.code !== 0 ? 
        `错误: ${statusResult.data.last_error.code} - ${statusResult.data.last_error.msg}` : 
        'AI处理失败';
      throw new Error(errorMsg);
    }
    
    attempts++;
  }
  
  console.log(`轮询结束, 共${attempts}次, 状态: ${chatStatus}, 收集到${messages.length}条消息`);
  
  // 处理响应结果
  if (messages.length === 0) {
    throw new Error('未能获取AI回复');
  }
  
  // 提取文本回复和推荐问题
  const textMessages = messages.filter(m => m.type === 'text');
  const textResponse = textMessages.length > 0 ? textMessages[textMessages.length - 1] : null;
  const suggestions = messages.filter(m => m.type === 'suggestion');
  
  // 返回处理结果
  return {
    success: true,
    requiresAction: false,
    data: {
      content: textResponse ? textResponse.content : '没有找到文本回复',
      conversationId: conversationId,
      chatId: chatId,
      chatStatus: chatStatus,
      suggestions: suggestions,
      allMessages: messages,
      usage: statusResult.data.usage
    }
  };
} 