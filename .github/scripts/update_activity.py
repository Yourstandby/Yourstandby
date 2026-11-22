#!/usr/bin/env python3
"""拉最近的公开动态，注入 README 的 ACTIVITY 标记之间。
只依赖标准库；用 GITHUB_TOKEN 提高限流额度。"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

URL = "https://api.github.com/users/{login}/events/public?per_page=100"
START, END = "<!-- ACTIVITY:START -->", "<!-- ACTIVITY:END -->"

KIND = {
    "PushEvent": "更新代码",
    "PullRequestEvent": "Pull request",
    "PullRequestReviewEvent": "评审代码",
    "IssuesEvent": "Issue",
    "IssueCommentEvent": "参与讨论",
    "WatchEvent": "关注项目",
    "ForkEvent": "Fork",
    "CreateEvent": "新建仓库",
    "ReleaseEvent": "发布版本",
    "PublicEvent": "开源仓库",
}


def opener():
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    handler = urllib.request.ProxyHandler({"https": proxy, "http": proxy} if proxy else {})
    return urllib.request.build_opener(handler)


def fetch(login, token):
    req = urllib.request.Request(
        URL.format(login=login),
        headers={"Authorization": "Bearer " + token,
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "yourstandby-activity"})
    with opener().open(req, timeout=30) as resp:
        return json.load(resp)


def describe(event):
    kind = KIND.get(event["type"])
    if not kind:
        return None
    detail = ""
    payload = event.get("payload", {})
    if event["type"] == "PushEvent":
        n = len(payload.get("commits", []))
        if n:
            detail = " · " + str(n) + " commits"
    elif event["type"] == "PullRequestEvent":
        action = payload.get("action", "")
        if action == "closed" and payload.get("pull_request", {}).get("merged"):
            action = "merged"
        if action:
            detail = " · " + action
    return kind + detail


def render(events, login):
    rows, seen = [], set()
    for event in events:
        repo = event.get("repo", {}).get("name", "")
        if event["type"] == "PushEvent" and repo.lower() == (login + "/" + login).lower():
            continue  # 自动统计提交不算动态
        label = describe(event)
        if not label:
            continue
        key = (label, repo)
        if key in seen:
            continue
        seen.add(key)
        ts = dt.datetime.strptime(event["created_at"], "%Y-%m-%dT%H:%M:%SZ")
        ts = ts + dt.timedelta(hours=8)
        rows.append("- " + format(ts, "%Y-%m-%d") + " · " + label +
                    " · [" + repo + "](https://github.com/" + repo + ")")
        if len(rows) >= 8:
            break
    return "\n".join(rows) if rows else "- 暂无公开动态。"


def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    login = os.environ.get("GH_LOGIN", "Yourstandby")
    if not token:
        sys.exit("missing GITHUB_TOKEN")
    block = render(fetch(login, token), login)
    readme = open("README.md", encoding="utf-8").read()
    if START not in readme or END not in readme:
        sys.exit("activity markers missing in README.md")
    new = re.sub(re.escape(START) + r".*?" + re.escape(END),
                 START + "\n" + block + "\n" + END, readme, flags=re.S)
    if new == readme:
        print("activity unchanged")
        return
    open("README.md", "w", encoding="utf-8", newline="\n").write(new)
    print("activity updated:", block.count(chr(10)) + 1, "rows")


if __name__ == "__main__":
    main()
