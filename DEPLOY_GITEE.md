# Gitee Pages 发布

当前工程已经包含 `build/web-mobile` 导出产物，可直接用下面脚本发布到 Gitee Pages：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\deploy-gitee-pages.ps1 -RepoUrl <你的Gitee仓库地址> -Branch master
```

说明：

- 发布源目录默认是 `build/web-mobile`
- 脚本会把内容同步到 `temp/gitee-pages-publish`
- 会自动补 `.nojekyll`
- 会初始化独立 Git 仓库并强制推送到指定分支

常见仓库地址格式：

```text
https://gitee.com/<用户名>/<仓库名>.git
git@gitee.com:<用户名>/<仓库名>.git
```

Gitee Pages 一般在仓库 Pages 服务开启后可通过类似下面的地址访问：

```text
https://<用户名>.gitee.io/<仓库名>/
```
