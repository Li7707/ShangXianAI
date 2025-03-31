// index.js
Page({
  data: {
    // 示例问题列表
    exampleQuestions: [
      "如何确定音乐创作的主题风格？",
      "在 Python 编程中，如何高效地处理数据？",
      "我想创作一首欢快的流行歌曲，有哪些合适的和弦走向？"
    ],
    inputValue: '',
    messages: [],
    showMessages: false, // 控制是否显示消息区域
    conversationId: null,
    suggestedQuestions: []
  },

  onLoad: function() {
    console.log("页面加载完成");
    // 检查资源文件是否存在
    wx.getFileSystemManager().access({
      path: '/assets/logo.png',
      success: () => {
        console.log('logo.png 文件存在');
      },
      fail: () => {
        console.error('logo.png 文件不存在');
      }
    });
  },

  onInput: function(event) {
    const inputValue = event.detail.value;
    console.log("用户输入:", inputValue);
    this.setData({
      inputValue: inputValue
    });
  },

  onAddButtonClick: function() {
    console.log("点击了加号按钮");
  },

  onMicButtonClick: function() {
    console.log("点击了麦克风按钮");
  },

  // 发送消息到AI
  sendMessage: function() {
    if (!this.data.inputValue.trim()) return;
    
    const userMessage = this.data.inputValue;
    
    this.setData({
      messages: [...this.data.messages, {
        content: userMessage,
        isUser: true
      }],
      inputValue: '',
      showMessages: true
    });

    // 调用Vercel服务而非云函数
    wx.showLoading({
      title: '思考中...',
    });
    
    wx.request({
      url: 'https://your-actual-vercel-domain/api/chat', // 请替换为实际的Vercel域名
      method: 'POST',
      data: {
        message: userMessage,
        conversationId: this.data.conversationId
      },
      success: res => {
        if (res.data.success) {
          // 处理AI回复
          const aiResponse = res.data.content || '抱歉，我无法理解您的问题';
          
          this.setData({
            messages: [...this.data.messages, {
              content: aiResponse,
              isUser: false
            }],
          });
          
          // 保存会话ID
          if (res.data.conversationId) {
            this.setData({
              conversationId: res.data.conversationId
            });
          }
          
          // 处理推荐问题
          if (res.data.suggestions && res.data.suggestions.length > 0) {
            this.setData({
              suggestedQuestions: res.data.suggestions
            });
          } else {
            this.setData({
              suggestedQuestions: []
            });
          }
        } else {
          wx.showToast({
            title: res.data.error || '请求失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('请求失败：', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },
  
  // 点击推荐问题
  onTapSuggestedQuestion(e) {
    const question = e.currentTarget.dataset.question;
    this.setData({
      inputValue: question
    });
    this.sendMessage();
  },

  // 处理工具调用
  handleToolCalls(data) {
    console.log("需要处理工具调用:", data);
    
    if (data.actionType === 'submit_tool_outputs' && data.toolCalls && data.toolCalls.length > 0) {
      // 这里处理不同类型的工具调用
      // 示例：处理local_data_assistant工具
      const toolOutputs = [];
      
      data.toolCalls.forEach(call => {
        if (call.type === 'function') {
          let toolOutput = null;
          
          // 根据函数名处理不同工具
          if (call.function.name === 'local_data_assistant') {
            try {
              const args = JSON.parse(call.function.arguments);
              // 这里实现local_data_assistant的处理逻辑
              // 示例数据
              toolOutput = {
                tool_call_id: call.id,
                output: JSON.stringify({
                  weather: "晴天",
                  temperature: "25°C",
                  location: args.location
                })
              };
            } catch (e) {
              console.error('解析工具参数失败:', e);
              toolOutput = {
                tool_call_id: call.id,
                output: JSON.stringify({ error: "无法处理请求" })
              };
            }
          } else {
            // 其他未知工具
            toolOutput = {
              tool_call_id: call.id,
              output: JSON.stringify({ error: "不支持的工具类型" })
            };
          }
          
          if (toolOutput) {
            toolOutputs.push(toolOutput);
          }
        }
      });
      
      // 准备工具输出数据
      const toolOutputData = {
        chatId: data.chatId,
        conversationId: data.conversationId,
        outputs: toolOutputs
      };
      
      // 调用sendMessage发送工具输出
      this.sendMessage(true, toolOutputData);
    } else {
      // 不支持的动作类型
      this.setData({
        messages: [...this.data.messages, {
          content: "抱歉，我无法处理这种类型的请求。",
          isUser: false
        }]
      });
    }
  }
});
