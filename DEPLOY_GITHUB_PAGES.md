# GitHub Pages 发布

当前工程可直接把 `build/web-mobile` 发布到 GitHub 仓库 `main` 分支下的 `docs/` 目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\deploy-github-pages.ps1
```

如需指定仓库：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\deploy-github-pages.ps1 -RepoUrl https://github.com/<用户名>/<仓库名>.git
```

默认行为：

- 从 `build/web-mobile` 读取静态产物
- 克隆目标仓库到 `temp/github-pages-repo`
- 覆盖仓库内的 `docs/` 目录
- 自动补 `.nojekyll`
- 提交并推送到 `main`

默认 GitHub Pages 地址格式：

```text
https://<用户名>.github.io/<仓库名>/
```

如果推送完成后网页还没生效，需要到仓库 `Settings -> Pages` 中把发布来源设置为：

- `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`
