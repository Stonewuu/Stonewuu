export const extraEntries = [
  ["starChange","Star 净变化",1,"个","sum"],["forkChange","Fork 净变化",1,"个","sum"],["watcherChange","订阅净变化",1,"人","sum"],
  ["starHistoryTotal","历史新增 Star 累计",1,"个"],["forkHistoryTotal","现存 Fork 创建累计",1,"个"],
  ["totalIssues","全部 Issue",2,"个"],["totalPR","全部 PR",2,"个"],["pinnedIssues","置顶 Issue",2,"个"],
  ["openMilestones","进行中里程碑",2,"个"],["closedMilestones","已关闭里程碑",2,"个"],
  ["topicCount","仓库主题",1,"个"],["projectBoards","关联项目看板",2,"个"],["environments","部署环境",4,"个"],
  ["issueComments","Issue 评论",2,"条"],["prComments","PR 会话评论",2,"条"],["issueReactions","Issue 表情回应",2,"次"],
  ["prReactions","PR 表情回应",2,"次"],["assignedIssues","有负责人的未关闭 Issue",2,"个"],
  ["labeledIssues","有标签的未关闭 Issue",2,"个"],["milestoneIssues","已排入里程碑的未关闭 Issue",2,"个"],
  ["lockedIssues","已锁定 Issue",2,"个"],["completedIssues","标记完成的 Issue",2,"个"],
  ["declinedIssues","标记不计划的 Issue",2,"个"],["duplicateIssues","标记重复的 Issue",2,"个"],
  ["draftOpenPR","待处理草稿 PR",2,"个"],["reviewRequests","待处理审阅邀请",2,"个"],
  ["reviewThreads","PR 评审讨论串",2,"条"],["submittedReviews","PR 评审记录",2,"条"],
  ["approvalReviews","通过的评审",2,"条"],["changeReviews","要求修改的评审",2,"条"],
  ["commentReviews","仅评论的评审",2,"条"],["dismissedReviews","已撤销评审",2,"条"],
  ["inlineComments","代码行评论",2,"条"],["inlineReactions","代码行评论回应",2,"次"],["newInlineComments","新增代码行评论",2,"条","sum"],
  ["prLinesAdded","各 PR 累计新增行",3,"行"],["prLinesDeleted","各 PR 累计删除行",3,"行"],
  ["prChangedFiles","各 PR 累计变更文件",3,"个"],["prCommitCount","各 PR 累计提交",3,"次"],
  ["issueCloseHours","平均 Issue 关闭耗时",2,"小时","weighted"],["prMergeHours","平均 PR 合并耗时",2,"小时","weighted"],
  ["protectedBranches","受保护分支",3,"个"],["ruleSets","仓库规则集",3,"个"],["activeRuleSets","生效规则集",3,"个"],
  ["submodules","Git 子模块",3,"个"],["commitComments","提交评论",3,"条"],["netLines","每周代码净增行数",3,"行","sum"],
  ["gitEvents","仓库引用变动",3,"次","sum"],["pushes","普通推送",3,"次","sum"],["forcePushes","强制推送",3,"次","sum"],
  ["branchCreates","新增分支",3,"次","sum"],["branchDeletes","删除分支",3,"次","sum"],["prMergeActivity","PR 合并活动",3,"次","sum"],["queueMerges","合并队列合入",3,"次","sum"],
  ["stableReleases","正式发布版本",4,"个"],["prereleases","预发布版本",4,"个"],["releaseBytes","发布附件总容量",4,"字节"],
  ["downloadedAssets","有下载记录的附件",4,"个"],["activeWorkflows","已启用工作流",4,"个"],["inactiveWorkflows","未启用工作流",4,"个"],
  ["completedRuns","完成的工作流运行",4,"次","sum"],["skippedRuns","跳过的运行",4,"次","sum"],["timedOutRuns","超时运行",4,"次","sum"],
  ["neutralRuns","中性结果运行",4,"次","sum"],["runSuccessRate","工作流运行成功率",4,"%","rate"],
  ["meanJobSeconds","平均任务运行时长",4,"秒","weighted"],["meanQueueSeconds","平均任务等待时长",4,"秒","weighted"],
  ["answeredDiscussions","已有答案的讨论",5,"个"],["closedDiscussions","已关闭讨论",5,"个"],["discussionVotes","讨论赞同",5,"次"],
  ["discussionComments","讨论评论",5,"条"],["discussionReactions","讨论表情回应",5,"次"],["discussionCategories","讨论分类",5,"个"],
  ["pinnedDiscussions","置顶讨论",5,"个"],["registryPackages","GitHub Packages 软件包",5,"个"],["packageVersions","软件包版本",5,"个"],
  ["manifests","依赖清单",5,"个"],["parseableManifests","可解析依赖清单",5,"个"],["oversizedManifests","超限依赖清单",5,"个"],
  ["manifestEntries","清单依赖条目",5,"项"],["dependencyPackages","材料清单依赖包",5,"个"],["dependencyEdges","依赖关系",5,"条"],
  ["licensedDependencies","已标注许可证的依赖",5,"个"],["dependencyEcosystems","依赖生态",5,"个"],
  ["publishedAdvisories","已公开安全公告",5,"个"],["criticalAdvisories","严重公告",5,"个"],["highAdvisories","高危公告",5,"个"],
  ["moderateAdvisories","中危公告",5,"个"],["lowAdvisories","低危公告",5,"个"],
  ["trackedFiles","默认分支文件",3,"个"],["trackedFolders","默认分支目录",3,"个"],
  ["trackedBytes","默认分支文件容量",3,"字节"],["largestFile","最大文件容量",3,"字节"],["fileTypes","文件扩展名种类",3,"种"],
  ["symlinks","符号链接",3,"个"],["executableFiles","可执行文件",3,"个"],["trackedManifests","仓库内包管理清单",5,"个"],
  ["lockFiles","依赖锁文件",5,"个"]
];

export const ratios = {
  jobSuccessRate: ["passJobs","doneJobs",100],
  runSuccessRate: ["success","completedRuns",100],
  meanJobSeconds: ["jobSeconds","timedJobs",1],
  meanQueueSeconds: ["queueSeconds","waitedJobs",1],
  issueCloseHours: ["issueCloseSeconds","issueClosed",1/3600],
  prMergeHours: ["mergeSeconds","mergedSamples",1/3600]
};

export const additionalSourceNames = {
  planning:"仓库规划与主题", projects:"关联项目看板", branchRules:"分支与规则集", engagement:"议题互动与标签",
  reviewMetrics:"PR 评审与变更",reviewComments:"代码行评论",activity:"仓库引用活动",discussionDetail:"讨论互动",
  manifests:"依赖图清单",dependencies:"软件材料清单",packages:"GitHub Packages",publishedAdvisories:"公开安全公告",
  environments:"部署环境",files:"默认分支文件与包管理清单"
};
