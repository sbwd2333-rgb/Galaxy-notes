import { runSelfTest } from '../electron/selftest'

runSelfTest()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.fail.length === 0 ? 0 : 1)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
