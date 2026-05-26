# Public Beta Learning Metrics

The public beta should optimize for learning quality, not traffic volume.

## Hero Metrics

| Metric | Meaning | Source |
| --- | --- | --- |
| Executable path rate | Share of scanned public signals that become safe local packet candidates | `/v0/open-demand/scan` |
| Time to ranked paths | Seconds from scan to ranked paths | `/v0/open-demand/scan` |
| Unsafe actions prevented | Count of spend/private/public-write/supplier gates triggered before execution | `/v0/open-demand/scan`, `/v0/metrics` |

## Beta Metrics

| Metric | Meaning | Source |
| --- | --- | --- |
| Route usefulness | Whether the route felt useful to a beta user | `/v0/feedback`, `/v0/v2/feedback`, GitHub Issues |
| Verifier pass rate | Whether proof packets pass local verifier checks | Proof runner reports |
| Task type distribution | Which task classes users try | V2 intake metadata |
| Block reason distribution | Which gates users hit | Stop conditions and metrics |
| Confusion rate | Issues about unclear positioning or UI | GitHub Issues |
| Private-input attempts | Safety-warning failure signal | Hosted rejections and issue review |

## Review Questions

Ask after each beta wave:

- Did users understand that BEAN routes before execution?
- Did users try real public tasks or only toy prompts?
- Did users ask for marketplace fulfillment?
- Did safety warnings prevent private-data attempts?
- Did route explanations create trust?
- Which path was most valuable: owned agent, public path, or build decision?
