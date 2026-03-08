---
name: get_weather_open
description: 使用 OpenWeather API 获取指定城市的实时天气信息
---

# 获取天气技能 (OpenWeather API 版本)

## 使用场景
当用户询问某个城市的天气情况时使用此技能。使用 OpenWeather API 替代 wttr.in，提供更稳定和详细的天气信息。

## 前提条件
1. 需要 OpenWeather API 密钥
2. 需要在环境变量中设置 OPENWEATHER_API_KEY

## 执行步骤

1. 从用户消息中提取城市名称
2. 使用 `python_repl` 工具编写 Python 代码调用 OpenWeather API：
   ```python
   import os
   import requests
   import json
   
   # 从环境变量获取 API 密钥
   api_key = os.getenv("OPENWEATHER_API_KEY")
   city = "城市名"  # 从用户输入中提取
   
   if not api_key:
       print("错误：未设置 OPENWEATHER_API_KEY 环境变量")
   else:
       # 调用 OpenWeather API
       url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric&lang=zh_cn"
       response = requests.get(url)
       
       if response.status_code == 200:
           data = response.json()
           # 提取天气信息
           weather = {
               "城市": data["name"],
               "国家": data["sys"]["country"],
               "温度": f"{data['main']['temp']}°C",
               "体感温度": f"{data['main']['feels_like']}°C",
               "天气状况": data["weather"][0]["description"],
               "湿度": f"{data['main']['humidity']}%",
               "气压": f"{data['main']['pressure']} hPa",
               "风速": f"{data['wind']['speed']} m/s",
               "风向": data["wind"].get("deg", "未知"),
               "能见度": f"{data.get('visibility', 0) / 1000} km" if data.get('visibility') else "未知"
           }
           print(json.dumps(weather, ensure_ascii=False, indent=2))
       else:
           print(f"错误：无法获取天气信息，状态码：{response.status_code}")
           print(f"错误信息：{response.text}")
   ```

3. 解析返回的 JSON 数据，提取关键信息
4. 用自然语言向用户汇报天气情况

## 示例

用户：「查询北京的天气」

执行流程：
1. 提取城市：北京 (Beijing)
2. 在 python_repl 中执行上述代码，将 city 替换为 "Beijing"
3. 解析返回的 JSON 结果
4. 回复：「北京当前天气：晴，温度 25°C，体感温度 26°C，湿度 40%，风速 3.5 m/s。」

## 备用方案
如果 OpenWeather API 不可用，可以回退到使用 fetch_url 访问 wttr.in：
```python
import requests
try:
    # 尝试 OpenWeather API
    # ...
except Exception as e:
    # 回退到 wttr.in
    fallback_url = f"https://wttr.in/{city}?format=j1&lang=zh"
    fallback_response = requests.get(fallback_url)
    # 解析 wttr.in 数据
```

## 注意事项
1. **API 密钥**：必须先在环境变量中设置 OPENWEATHER_API_KEY
2. **城市格式**：建议使用英文城市名，OpenWeather API 支持中文但英文更可靠
3. **单位系统**：使用公制单位 (metric)
4. **语言**：设置为中文 (lang=zh_cn)
5. **错误处理**：妥善处理 API 调用失败的情况
6. **速率限制**：OpenWeather 免费版有调用限制，注意不要频繁调用

## 环境变量设置
在 .env 文件中添加：
```
OPENWEATHER_API_KEY=your_api_key_here
```

## 获取 API 密钥
1. 访问 https://openweathermap.org/api
2. 注册账号
3. 在 Dashboard 中创建 API 密钥
4. 免费版每天有 60 次调用限制

## 数据字段说明
- main.temp: 当前温度 (摄氏度)
- main.feels_like: 体感温度
- weather[0].description: 天气描述
- main.humidity: 湿度百分比
- wind.speed: 风速 (米/秒)
- visibility: 能见度 (米)
