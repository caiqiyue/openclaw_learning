# 原文

今天换一条线来继续拆OpenClaw：工具。

从另外一个维度来看整个流程。

模型生成文字本身不会改变外部世界，但工具调用会：写库、发短信、触发自动化脚本。我们可以把这类“函数体外的状态变更”叫副作用（side effect）:



 **一旦做了，事情就不可逆。你再强的模型，也很难靠自觉保证每次都“做对”。**

所以我更愿意从工程角度给一个判断：

**真正决定能不能上线的，往往是副作用是否可控。工具越多，副作用面越大。**

OpenClaw 的做法很像老派系统工程师的直觉：把副作用拆成几道闸门，每道闸门只管一件事，然后把“允许”变成系统能验证的形状。

## 太长不看版（10 条）

- • 把工具调用当成“带副作用的事务”来看，会更接近真实线上问题。
- • OpenClaw 用三道闸门治理副作用：sandbox、tool policy、elevated。
- • sandbox 解决“在哪里跑”：Docker 里，还是宿主机上。
- • tool policy 解决“能不能用”：allow/deny 的硬约束，`deny` 永远更硬。
- • elevated 是 exec 的逃生门：`on/ask` 把 exec 拉回宿主机但仍遵守审批；`full` 会跳过审批（更危险）。
- • exec approvals 是“人类确认”的保险丝：allowlist + 可选弹窗；UI 不可达时会走 fallback（默认拒绝）。
- • approvals 只在 `exec.host=gateway|node` 这类“真实宿主机执行”场景生效。一个常见坑是：sandbox 没开时，`host=sandbox` 实际也在网关宿主机跑，而且不走 approvals。
- • allowlist 按“解析后的可执行文件路径”匹配，basename 不可靠。
- • safe bins 把一小类命令限制为 stdin-only 模式，避免把文件读写塞进参数里，也避免把解释器塞进“看似无害”的名单。
- • 对外暴露网关前，先跑 `openclaw security audit`，很多事故来自配置脚枪，不来自提示词攻击。

------

## 1）工具不是能力，它是权限

很多团队做 Agent，喜欢把工具当成“技能包”，越多越强。

但一旦你把 Bot 接进真实世界，工具更像权限：

- • 能不能读文件
- • 能不能写文件
- • 能不能跑命令
- • 能不能改配置、加 cron、对外发消息

这类能力不会因为“模型更聪明”就自动变安全。

治理工具的重点在“机制”：把副作用边界写进系统里，让系统能拦、能审、能回溯。靠 prompt 叮嘱模型自律，线上靠不住。

OpenClaw 的三道闸门，正好把这件事拆得很清楚。

------

## 2）三道闸门，各管一件事

先把全景图画出来。它很像权限链路：先定运行域，再做能力过滤，最后才讨论 break-glass（破窗开关）。

图 1：工具执行的三道闸门（从请求到落地）

![205d9e39a1692dcb801a894223f26c6d](E:\learn-claude-code\docs\assests\205d9e39a1692dcb801a894223f26c6d.png)

这张图里每个闸门都很克制：

- • sandbox 不讨论你能做什么，只讨论你在哪里做。
- • tool policy 不讨论你在哪里做，只讨论你能不能调用这个工具。
- • elevated 不讨论你能不能 exec，只讨论 sandbox 里能不能跳回宿主机。
- • approvals 则把“最后一步”交给人类确认，并把允许形态收敛成 allowlist。

当“副作用链路”来读，OpenClaw 的设计取舍会更清楚。

为了把概念彻底对齐，我建议你用一句话记住这四个词的分工：

| 机制           | 它在回答什么                          | 典型配置键（示意）                                |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| sandbox        | 工具在哪里跑                          | `agents.defaults.sandbox.*`                       |
| tool policy    | 哪些工具能用                          | `tools.allow/deny`、`tools.sandbox.tools.*`       |
| elevated       | sandbox 里能不能跳回宿主机 exec       | `tools.elevated.*`、`/elevated on                 |
| exec approvals | 宿主机 exec 要不要“白名单 + 人类确认” | `~/.openclaw/exec-approvals.json`、`tools.exec.*` |

------

## 3）闸门①：sandbox 先划清信任边界

治理副作用第一步：划边界。

OpenClaw 的 sandbox（Docker）解决的是最核心的风险面：

- • 工具运行在容器里，默认看不到宿主机的真实文件系统。
- • `workspaceAccess` 决定 sandbox 能不能看到你的工作区：`none / ro / rw`。
- • bind mount 是穿墙洞。挂什么就等于把什么交给 sandbox，模式没写默认就是可写，更建议优先 `:ro`。
- • 默认情况下，sandbox 容器是无网络的；如果你指望它在线装依赖，要显式配置网络或自定义镜像。

我会提醒团队把 sandbox 当成“显著缩小爆炸半径”的工程手段，而不是绝对安全边界。它能让很多错误变成可控事故，但不会让系统天然免疫。

一个典型的架构策略是“把暴露面分层”：

- • 私聊主会话更可信，限制可以稍松。
- • 群聊、频道更不可信，默认 sandbox + 只开放消息类工具。

重点在于你可以清楚回答：

**最坏情况下，模型能触达的真实世界范围是什么？**

------

## 4）闸门②：tool policy 把能力收敛成白名单思维

sandbox 划边界，tool policy 划权限。

OpenClaw 的 policy 很像我们熟悉的 ACL：

- • `allow` 非空时等价于白名单。
- • `deny` 永远更硬，命中即拒绝。
- • sandbox 下还可以有专门的 tool policy，只在 sandbox 启用时生效，用来进一步收紧容器内可用工具。

我建议你把 tool policy 的设计当成“暴露面治理”：

- • 对外入口只给消息类能力，别一上来就开放 `exec`、读写、浏览器控制。
- • 控制面类工具（改配置、定时任务）默认拒绝，这类副作用不该被陌生输入触发。
- • 真要开放文件能力，也要先限定边界，比如只允许 workspace 内部读写。

这一步做对了，很多“越界行为”会在系统层被硬拦下来，你不需要在 prompt 里反复叮嘱模型自律。

------

## 5）闸门③：elevated 是 break-glass，别当超能力用

很多人看到 elevated，会下意识理解成“管理员模式”。

更准确的说法是：

**elevated 只影响 exec 的落点，并且仍受 tool policy 约束。**

它解决的是一个现实矛盾：

- • 你希望默认在 sandbox 里运行，降低风险。
- • 但有些命令必须在真实宿主机上跑，光靠容器环境做不到。

在 OpenClaw 里你会看到几种典型用法：

- • `/elevated on` 或 `/elevated ask`：把 exec 拉回网关宿主机，但仍遵守 approvals（按 allowlist/ask 规则决定要不要提示）。
- • `/elevated full`：把 exec 拉回网关宿主机，并且跳过 approvals（等价于更激进的 break-glass）。

这里有两个硬边界不要忘：

- • 只有在会话确实 sandboxed 时，elevated 才会改变“在哪里跑”；否则本来就在宿主机上。
- • 如果 `exec` 被 tool policy deny 了，elevated 也帮不了你。

这跟我们做生产系统的习惯一致：

- • break-glass 可以有，但必须可限制、可审计、可回收。

------

## 6）exec approvals：把“最后一步”变成系统可验证的形状

如果前三道闸门是静态约束，exec approvals 更像动态确认。

它的定位很清晰：当你要在真实宿主机（网关主机或 node 主机）上执行命令时，用“白名单 + 可选弹窗”把风险收住。

它的状态文件在执行宿主机本地：

```
~/.openclaw/exec-approvals.json
```

它本质是一个本地 JSON：有全局 `defaults`（例如 `security`、`ask`、`askFallback`），也可以按 agent 维护 allowlist。

审批动作也做得很工程化：

- • `allow-once`：这次放行，跑完就结束。
- • `allow-always`：放行并写入 allowlist，后续同类命令可免打扰。
- • `deny`：拒绝。

如果需要弹窗但 UI 不可达，会按 `askFallback` 处理。默认是拒绝，避免无人值守时“自动放行”。

我特别在意它的两个设计细节：

### A. allowlist 按路径匹配

匹配对象是“解析后的可执行文件路径”，basename 不可靠。

这会让策略更接近真实安全边界：同名的二进制不一定同一个东西，路径才是可验证的对象。

### B. safe bins 把“看起来无害”的命令做成 stdin-only

OpenClaw 有一个 safe bins 列表，默认包含 `jq`、`grep`、`cut`、`sort`、`uniq`、`head`、`tail`、`tr`、`wc`。

这些命令在 allowlist 模式下可以不单独加 allowlist 条目，但前提是它们被强制成 stdin-only：

- • 拒绝文件参数和路径形 token
- • 避免 shell 展开（比如 glob、变量替换）

官方文档还有一个很重要的警告：不要把 `python3`、`node`、`bash` 这类解释器/运行时放进 safe bins。

原因很直观：你以为你在放行一个“过滤器”，实际是在放行一个“可以解释任意代码”的入口。

这件事的价值很现实：

你不用把“人类安全常识”交给模型，也不用在审批弹窗里靠人工识别每一个参数的风险。

系统把允许形态收敛成可验证的规则，才谈得上规模化。

为了让审批闭环更可观测，OpenClaw 还把流程做成事件：

- • 当 exec 需要审批时，工具会先返回 `status: "approval-pending"` 和一个审批 id。
- • 网关会广播 `exec.approval.requested` 给操作员客户端（Control UI、macOS app 等）。
- • 操作员用 `exec.approval.resolve` 处理，随后系统会发出 `Exec finished` / `Exec denied` 之类的事件。

图 2：exec approvals 的事件流（简化）

![7ca05561d300b94c1adc22acff7f6413](E:\learn-claude-code\docs\assests\7ca05561d300b94c1adc22acff7f6413.png)

## 7）排障时，先问“卡在哪道闸门”

如果你遇到“Tool blocked”“sandbox jail”，别先去翻模型输出。

先按顺序问三个问题：

1. 1. 当前会话是不是 sandboxed？工具实际跑在哪里？
2. 2. tool policy 有没有 deny 掉？是不是 allow 把别的都关了？
3. 3. 这次是不是走了 elevated？如果走了，elevated gate 和 approvals 是否满足？

实操上，如果你希望“少猜”，可以直接用官方的解释器：

```
openclaw sandbox explain
```

它会把有效 sandbox 配置、tool policy、elevated gate 以及可修复的 key 路径一次性打印出来。

图 3：定位“为什么工具被挡”的决策树

![84f40e0ff050c86b97b76cb64d986e6f](E:\learn-claude-code\docs\assests\84f40e0ff050c86b97b76cb64d986e6f.png)

这张图的价值是把问题从“模型怎么想”拉回“系统怎么管”，排障路径会短很多。

------

## 8）我会怎么起步：一份“先上线再扩张”的最小基线

如果你要把 Bot 接进群、接到多人可触达的入口，我更建议先从一个偏保守的基线出发，再逐步放开。

下面这份只是示意，核心思想是四句话：

- • 网关先别暴露到公网，先把鉴权做扎实。
- • DM 先隔离，别让不同人的输入默认共享上下文。
- • 工具默认收紧，只开放消息类能力。
- • `exec` 先拒绝，再走 allowlist + approvals，最后才考虑 break-glass。

示意配置（只保留关键键）：

```
{
  gateway: {
    mode: "local",
    bind: "loopback",
    auth: { mode: "token", token: "replace-with-long-random-token" },
  },
  session: { dmScope: "per-channel-peer" },
  agents: {
    defaults: { sandbox: { mode: "non-main", workspaceAccess: "none" } },
  },
  tools: {
    profile: "messaging",
    deny: ["group:automation", "group:runtime", "group:fs", "sessions_spawn", "sessions_send"],
    fs: { workspaceOnly: true },
    exec: { security: "deny", ask: "always" },
    elevated: { enabled: false },
  },
}
```

你会发现它跟“传统系统的上线顺序”很像：先把边界收紧，把不可逆操作关起来，再谈体验和能力扩张。

------

## 9）写在最后：先可控，再谈智能

Agent 当“聊天窗口”用，自然追求更聪明。当“执行系统”用，你会更关心：

- • 先把副作用收进边界里
- • 再把权限拆成系统可验证的形状
- • 最后再讨论开放到更多入口、更多人、更多插件

OpenClaw 的价值，很多时候就在这些工程护栏里。

安全,特别是信息安全,可能在这个社会,还是需要特别注意的。

一不小心,身份证、手机、家庭住址、钱包、密钥, 都有可能让你的龙虾提供给其他人了......

更好可能,你辛辛苦苦积累的资料、信息、知识库,给rm了......



# 解读

很多小白觉得 AI 只是个聊天软件，但 OpenClaw 的 AI 是有“手”的，它能帮你读写文件、跑代码（我们管这叫**副作用**）。为了防止它“乱砍乱杀”，我为它设计了**四道闸门**。

------

### 1. 第一道闸：沙箱 (Sandbox) —— “在哪干活？”

- **大白话：** 给 AI 找个“隔离样板间”（Docker 容器）。
- **核心逻辑：** 哪怕 AI 疯了想删你的硬盘，它也只能删掉那个小样板间里的东西，伤不到你真实的电脑系统。
- **权限控制：** 你可以决定它能不能看你的真实文件夹，是只能看（`ro`）还是能改（`rw`）。

### 2. 第二道闸：工具策略 (Tool Policy) —— “能干什么？”

- **大白话：** 给 AI 发一张“通行证”。
- **核心逻辑：** 就算 AI 在样板间里，你也可以规定它只能发短信，不准动文件。
- **黑白名单：** `deny`（拒绝）永远是最管用的。如果你把“删库”列入黑名单，它就算想破头也调不动这个功能。

### 3. 第三道闸：提权开关 (Elevated) —— “能不能破例？”

- **大白话：** 这是给 AI 留的“逃生门”。
- **核心逻辑：** 有时候 AI 必须在你的真实电脑上跑程序（比如安装软件），这时候它会向你申请“提权”。
- **防坑指南：** 别把这当成常态。只有你非常信任它时，才临时开启 `/elevated on`。

### 4. 第四道闸：人工审批 (Exec Approvals) —— “最后一道保险丝”

- **大白话：** 所有的危险动作，必须经过你点个头。
- **核心逻辑：** 当 AI 想执行一些敏感命令（比如 `rm -rf`）时，你的手机或电脑会弹出一个窗口问：“准不准？”
- **智能过滤：** 我们内置了一些安全的常用命令（比如搜寻文件、排序等），这些小动作可以不用弹窗，让你用起来没那么烦。

------

### 开发者给小白的“保命清单”：

作为新手，配置 OpenClaw 时请死守这几条基线：

1. **别把 AI 直接丢到公网：** 先在自己电脑（`loopback`）跑熟了再说。
2. **默认开启沙箱：** 尤其是你要让它读不明来源的消息时。
3. **不准“先斩后奏”：** 所有的 `exec`（跑命令）操作，默认设置成 `ask: always`（必须问我）。
4. **定期体检：** 运行 `openclaw security audit`，系统会告诉你哪些配置可能让你“倾家荡产”。