# 心语：个性化情绪陪伴工具

## 推荐：Docker Compose

```powershell
docker compose up --build -d
```

打开 http://localhost:8080 ，接口文档 http://localhost:8080/docs 。
环境封装、数据保存和检查命令见 [Docker 说明](docs/DOCKER.md)。当前为开发中的课程原型，完整计划仍在实现中。

## 启动后端

```powershell
cd backend
# 本地运行使用 Python 3.11；推荐使用上面的 Docker 环境
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

接口文档：http://localhost:8000/docs

## 启动前端

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173。

## 运行分类指标

```powershell
cd backend
python classification.py
```

指标文件输出到项目根目录的 `data/classification_metrics.json`。这是模拟中文文本的独立测试，不代表公开数据或真实用户上的表现。

## 演示顺序

1. 在“记录”中写入情绪和经历，保存并查看初判。
2. 在“历史记忆”中检索关键词，核对原文和日期。
3. 在“活动建议”中输入诉求并设置预算，接受或拒绝建议。
4. 在“兴趣画像”中查看反馈产生的偏好条目。
5. 关闭“记忆调用”，确认检索结果为空；再删除一条记录并重复检索。

项目只用于日常情绪记录、自我回顾和活动选择辅助，不承担心理诊断或治疗功能。
