# ECO-02A FULL-3 / FULL-4 — exact candidate reconciliation

Candidate: `fb26e5ae0092cfbebeeec115614db0b401f15871`; frozen source: `08de420ca29be16b6f6bee725a30b599b061df16`. PR #32, `feat/strict-parity-prerequisites`; reconciled 2026-10-14.

Machine-readable reconciliation: [evidence-bundle JSON](eco02a-evidence-bundle-fb26e5a.json), SHA-256 `24f659decd132f904ca036ddb0836b870c725dd60d34837442a240e24da40aec`.

## Hosted checks on this exact SHA

| Workflow | Run | Result |
|---|---:|---|
| CI | `38518309844` | PASS; Linux, Windows, macOS test suites; 3 host-matrix jobs; architecture and audits |
| Release Gate | `38518309954` | PASS; Linux, Windows, macOS |
| Phase 0 Architecture | `38518309801` | PASS |
| Pi 1.1 runtime evidence | `38518309830` | PASS |
| Pi Free Smoke | `38518309849` | SKIPPED; not counted as PASS |

## Artifact identity and matrix result

| Host | GitHub artifact | Archive size | Archive SHA-256 | Packed candidate SHA-256 recorded in all eight cells | Source manifest SHA-256 |
|---|---|---:|---|---|---|
| Linux | `pi-support-Linux-fb26e5ae0092cfbebeeec115614db0b401f15871` | 18,742 bytes | `sha256:55b50a36f7b2165dd7b0c93de55240c9ba9b4a63d29846027d0b5a2c21d6b12f` | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` |
| Windows | `pi-support-Windows-fb26e5ae0092cfbebeeec115614db0b401f15871` | 18,655 bytes | `sha256:99aa786cad4ba967d731e695e270f288d086f3ca0ca7e712e98561c0a9ae4a1e` | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` |
| macOS | `pi-support-macOS-fb26e5ae0092cfbebeeec115614db0b401f15871` | 19,074 bytes | `sha256:1e0abc4efc3703c53f0948f823cdfb13fa96448d8e6253b1d76643966ce92d30` | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` |

Each artifact contains exactly eight cell records and six contract receipts. All 24 cells bind the same candidate/source pair, exit naturally with code 0, observe shutdown, and record zero model calls. The packed-byte SHA is consistent within each host artifact. Windows records a different packed-byte and source-manifest digest than Linux/macOS; the Windows-specific manifest receipt and LF-to-CRLF admission test account for that checkout form. The evidence does not claim identical tarball bytes across operating systems.

### 24 matrix cells

| Host | Pi | Mode | Result | Packed bytes SHA-256 | Cell log SHA-256 |
|---|---|---|---|---|---|
| Linux | 0.85.1 | json | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `4bc0b05e7908c8f28e4c60481fbe34f34a2f6876814eb1b742a6daef0549aac2` |
| Linux | 0.85.1 | print | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Linux | 0.85.1 | rpc | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `ba38b25397c8a956676d9ce565768859b5cd20ab2e9c91c0426a84ea90499469` |
| Linux | 0.85.1 | tui | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `3dcbd813e03aefc9e82dced73cacddf024d658e6f2c68b03fd4291ef54b36294` |
| Linux | 1.1.0 | json | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `1e6519d6e991f7b5ce1b3727486ec9a97fbfb043e929cc85c4a564bfc29fb6ec` |
| Linux | 1.1.0 | print | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Linux | 1.1.0 | rpc | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `9678226826618fa86ceb5696efcf08de017c318b6dae4ced42548cc4b954574c` |
| Linux | 1.1.0 | tui | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `8c344a1d161abc07c9c375e20b4913b51c8b49d050893d3a38995d10338fcb38` |
| Windows | 0.85.1 | json | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `169896931d810f238a6d8bc625bf5934d5cf26eac0c28f5daf4b94138989094f` |
| Windows | 0.85.1 | print | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows | 0.85.1 | rpc | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `6f0d11c1c347640d69985f7336c8b9b4530cc75f7c2931e70bcfc25e51f6826a` |
| Windows | 0.85.1 | tui | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `56b35b660eada90e09d5b55c55aa62ca3c01829c274694b936515716223f87c3` |
| Windows | 1.1.0 | json | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `857a95fa04adccbe7aee0e2842e587c192750899d53b51e44a229027893b40f7` |
| Windows | 1.1.0 | print | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows | 1.1.0 | rpc | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `8e4764d3ad99d12202a1b1f0449b56131059cd9cbb0a671538446d549aad173f` |
| Windows | 1.1.0 | tui | PASS | `90fd6701ad48922735c3430f5d9c86c38b481447259bf69c2ad0b6106dec984e` | `8cda5fef995267386fb4cbdd40a78c87917e3c1acab1588617b0711643ac0a16` |
| macOS | 0.85.1 | json | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `b9716016c8c53924b1772ab65bd27478b835e3b88185d6d636ffeae805c29bbc` |
| macOS | 0.85.1 | print | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| macOS | 0.85.1 | rpc | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `6fd1eed75e2f52595572460a09d02ad69170f23a0b1baf0370875536eeedfc35` |
| macOS | 0.85.1 | tui | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `8d15679ea1d17aa16172770091a50f84b1b18910743d6f73461be12719e6926a` |
| macOS | 1.1.0 | json | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `3f28531e588682e2a3e18fbf023a08b807c34ce15a2c50ab0d3fdda20231981b` |
| macOS | 1.1.0 | print | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| macOS | 1.1.0 | rpc | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `7c0b6be15586f2f2133680b8a652eb8cc8915c9fd376a47ad40cda849f04b63d` |
| macOS | 1.1.0 | tui | PASS | `a944ab626f4ca38e11ea7731ea1fc9a2fc977833b4c1985fc74d9c7441923f64` | `fb0cc429114901577b0ceccc6963c5aea66f99d1c2049df0a79ef5c63429573d` |

### 18 candidate-bound receipts

| Host | Kind | Result | Manifest SHA-256 | Receipt log SHA-256 |
|---|---|---|---|---|
| Linux | failure | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `6fb814d5a5d45f0acef8bb37a2d9b39082746ec287320452bf615c241ea28700` |
| Linux | linux | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `bb2c1f071e0070ceec8b4e24f3da72e724d3f569b872a99741f192fbeca06592` |
| Linux | negative | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `02a6b8af9632f9e18438b8e376ce114e2d50491451e9543cd05c56610837d520` |
| Linux | pi-host | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `bb2c1f071e0070ceec8b4e24f3da72e724d3f569b872a99741f192fbeca06592` |
| Linux | positive | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `c2a61b5229136ac8d391631502137e274e41f164562afca4d52fa27a6ff78cd7` |
| Linux | recovery | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `0d8781f9d57f0b323b8c659d3cf7a5ba707d3905c4c6b7c3885bcedd5ef32477` |
| Windows | failure | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `127816465ec7af508a90706a1322b64a7506ce4434155ca9c6c2c86b7671179e` |
| Windows | negative | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `eaad2c59a0514e8a6298ce4f5eae0d618d42a4e3606bfbf3a71a99b08a1f5e0c` |
| Windows | pi-host | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `d16e7ce65058885385de87bbeb0d7be61af9ca16539fefacc8acc9ecb83891fc` |
| Windows | positive | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `50747b8b4d554983be5a28aa1812ac846cae17078802797071a296adb59209e5` |
| Windows | recovery | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `c466d014f6fd6d18636d19d4c3213b8af95d4b5b4c857622c8b0b519aa87a4b5` |
| Windows | windows | PASS | `1a7c706439630fc7339b247b66c61727235ac14d894f6f7a57578787558849f9` | `d16e7ce65058885385de87bbeb0d7be61af9ca16539fefacc8acc9ecb83891fc` |
| macOS | failure | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `f2597c53e6cc484f3f9923fced4ec6d64f6cf0d9964b09634602bff42608bf83` |
| macOS | macos | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `7fba091657c254d18ca59f9d7025c942ced588f44d93b2c0ca508040ba75533b` |
| macOS | negative | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `c2968e1105dcb020e0355cc4fc0821a79d94fdd3ba42ab59aa22eae77ba20b83` |
| macOS | pi-host | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `7fba091657c254d18ca59f9d7025c942ced588f44d93b2c0ca508040ba75533b` |
| macOS | positive | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `888ad33fab31fa4d6b3cf3322ff06f026da1577e41e707fab4e10a7329311b1d` |
| macOS | recovery | PASS | `378dc7dd9a834898e6e2dfe453280612a406f76585fb0e68374f3868bada8493` | `0940090a9dbcb7302ced9dd26d65279cc8db6254b1fd5dab0dc8c26a1b381412` |

## Scope and remaining gate

The union contains the eight required receipt kinds: positive, negative, failure, recovery, Linux, Windows, macOS, and Pi-host. The artifact records bind each receipt to this candidate, the frozen source commit, its manifest, and its log digest. The hosted test step and artifact inventory independently show all eight matrix records per OS; no skipped or forced-exit cell was admitted.

This reconciles FULL-3 execution and the eight FULL-4 receipt kinds for this candidate. It does not prove every version in the peer range, model/provider behavior, independent artifact provenance review, or FULL-5 drift/claim-overlay admission. It does not promote any ecosystem claim. Keep all 16 claims PARTIAL and 0 FULL until the remaining gates and independent review pass.
