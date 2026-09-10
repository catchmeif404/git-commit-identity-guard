# gitguard

[English README](README.md)

여러 GitHub 계정을 사용하는 개발 환경에서 잘못된 Git identity로 commit하거나 push하는 일을 막는 로컬 CLI입니다.

commit 작성자, GitHub remote owner, SSH 설정, branch history, 실제 remote 인증 계정을 검사합니다. credential을 저장하지 않고, global Git 설정을 변경하지 않으며, force push나 이미 배포된 history rewrite를 실행하지 않습니다.

## GitHub에서 설치

다음 명령으로 npm에서 전역 설치할 수 있습니다.

```bash
npm install --global git-commit-identity-guard
```

로컬 개발이 필요하면 저장소를 clone한 뒤 빌드합니다.

```bash
git clone https://github.com/catchmeif404/git-commit-identity-guard.git
cd git-commit-identity-guard
npm install
npm run build
npm link
```

이제 어느 Git 저장소에서든 `gitguard` 명령을 사용할 수 있습니다.

## 빠른 시작

보호할 저장소 안에서 한 번 실행합니다.

```bash
gitguard init
gitguard status
gitguard install-hooks
```

`init`은 저장소의 `.git/gitidentity.yml`에 로컬 정책을 생성합니다. 이 파일은 commit되지 않습니다. 기존 파일을 다시 만들려면 명시적으로 다음을 실행합니다.

```bash
gitguard init --force
```

hook을 설치하면 Git 작업 전에 자동으로 검사합니다.

```text
git commit -> pre-commit -> gitguard check --phase commit
git push   -> pre-push   -> gitguard check --phase push
```

차단되는 문제가 발견되면 exit code `1`을 반환하고 Git 작업이 중단됩니다.

## 명령어

```bash
gitguard status
gitguard check --phase commit
gitguard check --phase push
gitguard check-history
gitguard doctor
gitguard verify-remote
gitguard fix
gitguard fix --apply
```

commit 단계는 local `user.name`과 `user.email`을 검사합니다. push 단계는 여기에 remote owner, SSH 설정, 현재/default branch, 기본 branch 이후의 commit history 검사를 추가합니다.

기본 branch에 직접 push하는 경우 기본 정책은 `WARN`입니다.

`check-history`는 기본 branch를 자동 감지합니다. `origin/HEAD`, local remote metadata, `main`, `master` 순서로 확인합니다.

## Remote 인증 확인

```bash
gitguard verify-remote
```

SSH remote는 `ssh -T`로 확인합니다. HTTPS remote는 다음 순서로 credential을 찾습니다.

```text
GITHUB_TOKEN
GH_TOKEN
Git credential helper
```

찾은 credential은 GitHub `/user` API로 확인하고, 설정된 expected GitHub user와 비교합니다. credential은 파일에 저장하지 않습니다. 실제 인증 계정이 `github_user`와 다르면 검증이 실패하므로, 의도한 계정의 SSH alias나 HTTPS credential을 설정한 뒤 push해야 합니다.

## 잘못된 설정 수정

```bash
gitguard fix
```

기본적으로 dry run만 실행합니다.

```bash
gitguard fix --apply
```

`--apply`를 사용하면 다음 repository-local 설정만 수정합니다.

- `user.name`
- `user.email`
- `origin`

global Git config와 remote history는 수정하지 않습니다.

## 프로필

프로필은 저장소 외부의 다음 파일에 저장됩니다.

```text
~/.config/gitguard/profiles.yml
```

현재 저장소 identity로 프로필 생성:

```bash
gitguard profile init personal
```

이름 없이 추가하면 현재 remote 인증 계정을 가능한 경우 자동 감지합니다.

대화형으로 추가:

```bash
gitguard profile add company
```

옵션으로 추가:

```bash
gitguard profile add company \
  --name "Company" \
  --email "developer@company.example" \
  --github-user company-user \
  --ssh-host-alias github-company
```

조회와 적용:

```bash
gitguard profile list
gitguard profile show personal
gitguard profile
gitguard profile use personal
gitguard profile remove company --force
```

`profile use`는 현재 저장소의 local name과 email을 변경합니다. GitHub CLI/credential helper를
사용하는 HTTPS remote는 유지하고, SSH remote만 profile의 SSH alias로 변경합니다. global Git
설정은 변경하지 않습니다.

## 정책 설정

생성되는 정책 예시는 다음과 같습니다.

```yaml
policy:
  wrong_author: fail
  wrong_email: fail
  wrong_remote_owner: fail
  unexpected_ssh_identity: warn
  history_mismatch: fail
  direct_default_branch: warn
  remote_authentication: fail
```

지원하는 수준은 다음과 같습니다.

```text
fail          차단
warn          경고만 표시
require-check 차단
```

push 단계에서는 실제 GitHub 인증 계정과 `github_user`를 비교합니다. 인증 계정이 다르면
기본적으로 차단됩니다.

## JSON 출력

CI나 AI coding agent에서 사용하려면 `--json`을 붙입니다.

```bash
gitguard check --phase push --json
```

```json
{
  "result": "SAFE",
  "findings": [
    {
      "level": "PASS",
      "title": "Commit email",
      "detail": "developer@example.com"
    }
  ]
}
```

## 개발

```bash
npm install
npm run build
npm test
```

소스는 역할별로 분리되어 있습니다.

```text
src/index.ts                  CLI 진입점
src/cli/commands.ts           명령어 분기
src/git/                      Git 명령, remote, branch 감지
src/config/                   저장소 정책과 profile 설정
src/checks/                   identity, branch, history 검사
src/ssh/                      SSH config 검사
src/hooks/                    Git hook 설치
src/output/                   터미널·JSON 출력
```

자세한 구조와 로드맵은 [docs/DESIGN.md](docs/DESIGN.md)를 참고하세요.

## 현재 제한사항

- YAML reader는 gitguard 문서에 정의된 형식만 지원합니다.
- HTTPS remote 검증은 사용 가능한 GitHub credential이 있어야 합니다.
- SSH 검증은 `verify-remote`를 실행할 때만 수행합니다.
- 기본 branch를 Git metadata에서 찾지 못하면 `main` 또는 `master`를 사용합니다.
- GitHub history를 자동으로 rewrite하지 않습니다.

## License

아직 라이선스를 선택하지 않았습니다.
