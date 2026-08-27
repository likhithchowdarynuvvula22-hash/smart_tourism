import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

interface ScreenItem {
  name: string;
  title: string;
  screenshot?: { downloadUrl?: string };
  htmlCode?: { downloadUrl?: string };
  width?: string;
  height?: string;
  deviceType?: string;
}

const SCREENS_DATA: ScreenItem[] = [
  {
    name: "projects/5929619357992091792/screens/57986153d79445e8a30fcd5a6eba9263",
    title: "BharatAI - Home",
    deviceType: "DESKTOP",
    width: "2560",
    height: "3996",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAxZjgwZDZjNWEwMmQzYzY5MTk5MDAyMDlkEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1W_zjzG-vC-IiA5H7nQeySoYkz827TGUAukfTmxIFsQxFT2r3yZ_SQB0H3HdrjtxcUmMGdw5jtwKgVXjzqkzNU6PxfVGt1RwtugGqetOCq5tcLaTiu4SQ7BD7VVZb_R9buM-pk27KPDo_QOGtLBWe_kJ3-9aDG8hUsOMuk0X_2DFUWx8roVZunVmjgvtR0TwCn5rQ0LhC7v3L9RF-GLIXgLW5VrwYA4mYjY0S3Kq6kW__RdYbuhlPV-Ug" }
  },
  {
    name: "projects/5929619357992091792/screens/4d0e1ec4ea614c9691a9dcae1c48722d",
    title: "BharatAI - Home (Detailed)",
    deviceType: "DESKTOP",
    width: "2560",
    height: "3550",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMDMwZDRlNDUwN2M0ZDk5NGU4MTA3M2YwEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1Wp5eCrl6xPx_SijCfCLNt5Xq7T1DOyLQo2t117RITG3kMQLyAEmUz5eiajtHeLzaPOCAd2m_R1hn6L5uHmG6WM7lpnjAqnFGyTk4m-oC5BY-Vt5jSAcfn5E8pUO_mYV3nrc8sbYWfvHsyE0sQerKYQN6AsT9mQyVlBbZlALbdx9AupTvpPvGyKXpboQkMlfnmHRGKo2EFJOvOWeIBjodELi3lJggvxDCi56QGIodTFZbqpk3QLoh1SRyw" }
  },
  {
    name: "projects/5929619357992091792/screens/6499af45ca634ee6b50701a68dd88e3f",
    title: "BharatAI - AI Trip Planner",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMmJlNzBhY2YwNmFjNmQ0NjQxMGNiYjYzEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WB2midDm8luSxo5pb6ztH7iIBCwtM-UB11rViTXS0MJTzx2IU8gEwFo62nQR0JsywMwXiYH7EvAR7xbNI0dIGNAtpmdQXwYhMzszI9SSaiN5EqL3OEK-EcCsbMX82rEDJyJHuTXfGhLy-sH2jbG88mEepyLr6kqa3rEuiHSLTszKXNmOY_KtRpbItNJgtCNyWj9z49zyQbiZXDVto6wpr2ok_ThkbO0cV8E0ioP4w5GL_XfPtzgOZ84E4" }
  },
  {
    name: "projects/5929619357992091792/screens/4e60792739324e9f987a058da4bc892c",
    title: "BharatAI - AI Planner Assistant",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAxZjdkMzIyMDIwNmYxYzk3MDc4MDMwZDNiEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UzVhc1GCP-k3iAKedCHwsVXzzpHhDWgDhQxFsUT-YWJg0YJOf3HGk5WxDLNrRGJKGVcqMjDnayFIW8elVFqy62XDMHi-DgEWHbwKNVt79dur6537ElwSfBsOB146E-p0oVnab3Zjt-_zGBnfy9Z7cWfTwWnBd2yY4s9SvPA83hnom7XqBJyBebJ3WoFzmjsEQeY7zMOQ4MIGGVur1x8EKfJuFS1HoXwF4Kl2VW8ZdmtHwa54jI3PHKvoM" }
  },
  {
    name: "projects/5929619357992091792/screens/771481918d3c492182cbd268901f7339",
    title: "AI Trip Planner (Mobile)",
    deviceType: "MOBILE",
    width: "780",
    height: "1768",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMmNjZTg1NjYwN2M0ZDIyZmUwMDU5ZDU0EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VBTtQ8i1DgH7m1DqUtQMkwOUm63fX-4DUCGJTePkGRP-g8sUMD-EvUswnntv0Fu1MohTY3uyMFSgidiy2lJFlbw4_tg9Y0emufa3jgFj91He4riXN1fjnEr3GiBoz0fai9afyPk7r71HdyWq6tf2emfwloNZ7RLMRnqYoQm8WkbkuFlei8KsShDajBf4beJ2Tgv4hhxT7z0ICBYqIyN2cyqNLWowZTcjrGJmxl9aahyM3tHjDxSr-WDcQ" }
  },
  {
    name: "projects/5929619357992091792/screens/63b379f734be41059d632c53a63a6ba5",
    title: "BharatAI - Generated Itinerary",
    deviceType: "DESKTOP",
    width: "2560",
    height: "3136",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMzc3ZDFkN2MwMWI0ZTUwMGQzMmM5OWVjEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1U4xMhrMKNc8lOxQ0x7JwJGZpZ8xqde674wUjZ5iuGFc2AE6GPDHSBQkezY1CDPG-xVgo-arVTCLtnUsUVL8YoWokdcC3khf-1TboZEHv76Gt6tuwxiZAdbEwQrXGJYJ9ES5efVJo6F45crI9oS6mrK0V910M4XnimDDP1WZQiPXxxcWnm4F2_H8hjOke75MOs5raKifxWaEy5eg7ejBnqC5OPeKWOi3n5v1qI5mSbwzib4a7h9hoopMw" }
  },
  {
    name: "projects/5929619357992091792/screens/8d86a463364f441cb0329565bcb54e57",
    title: "BharatAI - Explore Destinations",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2200",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMGI0NGJlMjEwOTM0ZWNmYWZmMWMzOTZmEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WkJahqmqQDWVFmVKrn-wnvQ9CS8Z2RYSwaMZGiTZHGmtcKbsq9jekfqyCRFhvdk_hjHlNtlbMnj_97mJbIZIyZuoQMOCzY2j4RkTgV-hx70-OqYNwQ7L-CwbR2bwv9xv9oPEFidzKtLFkXUolCxZpwUdI_eZkaQfKY0e_fwnJjwCJ2ST651n5LEeZahgebjkJYU4FumGEy47Sx9j17R-r2vatzRgudMUPgVZAxP6jL4y1qTGFzVAl4b1Y" }
  },
  {
    name: "projects/5929619357992091792/screens/ee0b8c18d5ad4286b69357180d017ffa",
    title: "BharatAI - Explore India",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAxZjdlOTE4ZDkwNzc5OWViN2FkMGE3ZGIzEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XpbBZ33_xDWVqM0uJsopYGtKIoTjDRTTZeC2XlWg-1bUOwwh_kF6hHGHmhttU5eNadLUUkCguay12xFuvd9IfCoEFp0pvdHBdawfkaNRRFM9g9F0hIo84raYcKi9SEIyMl-MUv-MfNPL_lEL0uNkdMFj01hDcRZnApxbxYwL4P2K8P0ObSNXpl_LxG5i7X9MzQCKroOea-0dDbac6q6V7WBrCOgBHOnVU5oIb9nVzz7dwnHUYnOj2BFw" }
  },
  {
    name: "projects/5929619357992091792/screens/07f59b9ae87f481994284257d83efb4f",
    title: "Explore Destinations (Mobile)",
    deviceType: "MOBILE",
    width: "780",
    height: "2260",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMGE5NDQyOTcwN2M0ZWUyMGMyMDdhOWQ5EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VbmlQT7qAyaK2044NLXeLJzOxOP4d3rD001QISFB6VIGQbpsEIySHaTRqc4leVTYH4VaZAMGQyjva1iINb7ELsIL36sTLtT_Pb8Da31NUnpO5KMBqyFspbgt2kbh9vq3Me3gkmavZcTJ58frgmDiE6iWl3BBkmXbovIZYbRL-rtASaNyGA_Aj-ZK9MgX8y7u88mrwnE1M2gTYHFY0ZErOhaCugXstbneaU5o8uoSoOiTQ9YuLWkN-XFuU" }
  },
  {
    name: "projects/5929619357992091792/screens/03d9a2a1dc7849d7a5e474bd338178db",
    title: "BharatAI - Explore Searching State",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2524",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMGRlNmY2YmUwMWE2MTFkNDg0MTgzZDBhEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XegtFtRcAq2oxsIKWNt_Fq178-kk9jGjVMuJa3hncjaI003dIM40KdXNJZskdQnGqnNp9z71e_wcJ-Voh5q1lorvnNvl1-_EUy_1H9Hu1bmWxGhXkOisPlWnYokINeCXuMbGno0HNZ7p-CqqpAi_6RgrELXU_ooXHz5TDXnFoDN5roV4Wxwo0DggE1iPIPP_cAVaIvGT7HpTvkeDQw_GOl8Ec0Nh5NB0G5Qa2kHGrB7AlL6SfSfx_Xu2U" }
  },
  {
    name: "projects/5929619357992091792/screens/d379c6b9efc54d84a207dfe4a0ed1976",
    title: "BharatAI - Explore No Results State",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2050",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMGRjZDAwZjUwMWI0ZTVhYjZjMjM3ZWNjEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WTEtswjigSZEV4qKggDNlbOGrpic5aEbxZ9vLstJi79BbomQOw842blh-otB7cd_7Jb-bP9Vg6_ub1iTg8OUiOUOdAK-45wKdQUVNSk6UqilZupmDkA2C53j2VsC2EFPtsJPQyTyPx-Z-R_U61KfUjaZQ3Iq3ynaZZcCHPWxKCDPBDpWF3KhqzDVl4BssQ3TGAg8SOiQ41hdCcS_JOv6h1aXTXUFcJHzLxo1wXxrfbnqy_UB-SmvLZf1M" }
  },
  {
    name: "projects/5929619357992091792/screens/e7cfbedd607840528c90db353afcaf18",
    title: "BharatAI - Hampi Destination Guide",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2606",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyMjMyODcyNWUwMzMyZWQyZjRiMmFkZTVhEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1XttV1MoNIc0zZ97jBdsSkTutl6SaERAu39p3-yUhEf9rnm-EfO_a3erVpdibQ3ncSM5rA21Opg8GtaSIjLTPDjPw-vYbE0VYzRVm8yxMfPY86eeusmkKio-RzcOsQHnXfLdAlNu-QZ0m1k2QAvZwdzfy5cDvZ4WmBiRgFcW2RBY4biivW-DlJikR82srMzR2ztaAC2Y0uEjYwoJjhJkaN5X7cR3Q5_2G2CWYhy9ll_g7g5h1DA80wIRw" }
  },
  {
    name: "projects/5929619357992091792/screens/7e3639d0da9e4fd3bd3c6634305f3259",
    title: "BharatAI - Map Discovery",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNWE0Mzk0OWQwODlhZjU3YzFiMDYxNTkzEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1U7b0JpHnsVaR2Krnwm8JuXY5QF7I6WhW1VEPz6e3GaBLFMpaI-c8vrhI7A9WBC6dlf9ZPFSootl4GfV6s0d_t7yO6OfQ1SoFGqLUeUrf-fI4yPIeCvJxt0XISN6Yv7XUsu4aoFQBarCobeTXcI-WJ8Medprm4hUFWHTQo8hNnkZNwh6eYvBjw5EKlLmrqVp8X90p6BNECczFXQKtnieqeu8VBQmpv_1DONelaABtC_C2WEZ6Ri7rzxDg" }
  },
  {
    name: "projects/5929619357992091792/screens/7c6bbb807e5d40fca8ad30c94a8813f4",
    title: "Map Discovery (Mobile)",
    deviceType: "MOBILE",
    width: "780",
    height: "1768",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNWFmMjViZmUwMzMyY2E5NTIwMWU2ZjEyEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VkSVvfPJseYauFJSwGHw3IajKRn8nQeA9KvUG8zzVb-kKqaSgSeCuASls6TQxYcG-tPX7TW03g2gQSplCxwgAdMrtNcm_KuvQcixvgb4He2f_aELHzub69x4sLJ9Pgf5enQuaI9oHRqwq9OImrpm1FBhYOTZMGYd17wi_c5CU1Qi453yzofXE1OvLE5fgXRLkomH5IFK48Gi4lIgxQV_3vHxMsG41RN9vmWTCpQNxcfjfx_j_-Cl0YwTg" }
  },
  {
    name: "projects/5929619357992091792/screens/5625e128460d44c18ff2a627face7480",
    title: "BharatAI - Budget Intelligence",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2696",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNmRiN2JiMTAwOTI1Yzc1MDIzM2ExN2I4EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1W70PxRWfcQuh_HRVQ4MWZa6W_nyaU_Dp-0WXONvbsP1gw8dWy3SiRoBLUNjPmD_knRXgQBxNPQkLAu2dMecbWir7Rd0VVSSdwx0-J1kOo6I3a6ILM_QBKxvug_bmdPVDWHIMetpT9qz5vfBa4tZWehJw-h_sIae3KPZngan5INl6i_fmsTUZ_MoV2tRwapp3fh1IcRpoV29F_fLjshmyismPtyDAwpMP_6clp58iS_Ah8UNMnRueno1ZI" }
  },
  {
    name: "projects/5929619357992091792/screens/951aca9e80ae4a97b722bddbf5ceeeb9",
    title: "BharatAI - Travel Safety Intelligence",
    deviceType: "DESKTOP",
    width: "2560",
    height: "3498",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNjI2MzZjOWIwNzNhZjI5ZDA5MzkzMTY1EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WsKTw5mkLEMvqC3ngD1Jdn_rhcF1KJyzmbucU7yZwRkKUIGKoH3bm_0QpDBgXxIKktE0dDD8d5FRcdG3ymrMvz1HDPj6kVQoTTcZuxz75Lh132r4hG-aiMP7PsmPgFqutOXv0TfDOMgptOX74pA6CsmA24FsfGRngi_NNsarbn_lzQ5HwrsWzZF1mYBHsSNFFfVYZfO3b7GEFSFyFynNiA1inP59PIOz7jEqqdZfK-9nUo5aKMLrpkZNM" }
  },
  {
    name: "projects/5929619357992091792/screens/6eb4e81a93b34b648fa0096a07f81fe0",
    title: "BharatAI - Accessibility Intelligence",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNjdkZjAzNTkwMmQzY2E0MWRlMDg0ZTQxEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VeN95POI0DQOrz0sOVsg0id4a6d0hR69QRCjWaZecuKxGuuzsPi_C1hhHTbpl0NZRIxFviSrgfkqvsxl4S1uyodY4jX3nKYZAKg398j3HhGBpu-ryudq4DW9szyh-f3Br-KpOwlEs6Prum1h94EQ9mDoH4f7QkfU_5OPAVsiWCk5LXV1s6YWCIZGtEF9-_f2L0mpblPTy_f268BjHxbjPvaNpud9uQNu-xO7YpKflyiNzVZCC3Zw1iNgQ" }
  },
  {
    name: "projects/5929619357992091792/screens/039d3541b770434881750cd35f42d667",
    title: "BharatAI - Local Experiences",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2772",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNzUyZjgzOTgwMzM4NDUyNWI2MGZmMmI1EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UsjgmgtWuxE2_DLlV2RTxzSHhmZObNGl8m_eOvNvRmUlbBWT4LGCnR9GtqF3_p1jLCAj9qGAk4CrOSY9CqiKwK7zBaz_pJt4ULeVwlkzPj8bvAjFVFMAkKpfKBcRS8_zXri4NSgKSUgT58AUClnyAFEC_GOXn71AxSQDcNmuuK1vFbTUfxEDcXeFzc64PHEaNEEu4uRVfY1xMJ6L3qjhvnczVdWAMPzHx74Q0dVdKzFqWqUbpuaC965ZY" }
  },
  {
    name: "projects/5929619357992091792/screens/79067f3347744c44a3fbe0624755c53d",
    title: "BharatAI - My Journeys",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2460",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyM2VjMzkyYmYwN2M0ZDIyZmUwMDU5ZDU0EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WjOEhaFn48rbx5OcHbUBsIiboPwlZrpaF_6GV4VAST3MxdCFaxQqkdCguaBU06Y-3Tjl3ws1NOTCDBTir27EfzMWeVqvEDTrviUguraw3TIPODW-NSDRFJl68hNTfIlhJuYXJRwg7Sx9-57GfoDhZCHr3TIOfsfGUgt0Er3Cm_NntJG9BwplMArFNHgTO93Kirx9mzJEG51Z_5Tq7w04h8qw4sUwaTjVkoQQrX_qu4RThiX6ofqt1-nQ" }
  },
  {
    name: "projects/5929619357992091792/screens/9455299f51394a49b50be137a425bf14",
    title: "BharatAI - My Journeys (Detailed)",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2426",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAxZjZmOTBkNDUwNGVhYTdjYTFkMTZkY2IxEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WlXRaDdfFRkXO-FkvumoKNtbGxSNAx7vDesiPjDa3uw2t0QlcjB4WaNI-mpy2gPWBaxJtizbOD80QAdxSr2HEJx9GEHd043hed8pIQLO8VRyAd7xoPVSMVz1K_KIm-bkNqfgIlKcKbrVy7GxC49RwZBHEaeFsW1iLfkuTiSfcae3eIZFKSfm5QLeU-yzE5SuAzNLMh0E4kjmxDE1h7J-4Rv_-y0e8A-doqsKO8CRt2uLMiYFyP64t2IrM" }
  },
  {
    name: "projects/5929619357992091792/screens/712fb92b10f94baba2218ee7671ae137",
    title: "BharatAI - No Trips State",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNDFkYmVhMDYwN2M0ZWUyMGMyMDdhOWQ5EgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UBy-cJvDv-4O1zboBXuAxxYunlPFz6Z-TWhuU46ge55y0CpFiuapumutIKE4cnLOleyjw3riRVHFKN67f-g7qIzJorrXJXiNdfXpmpBCBSeolq6LfgmMe_5cRItDrm5lBZj1gPlJfiDjevz-kaFDBzyyGE2eI6kjGiXGsW-G1OxYpZsEEZzXR580S9Lv3dfsVlj8RAOOjUBm7WJgiU4IsLsI8X_gxiGnEpGal_eId8PecZ24wELgZ6DRs" }
  },
  {
    name: "projects/5929619357992091792/screens/52aa30cfbefb448eb886723baa2322fc",
    title: "BharatAI - Saved Destinations",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2386",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNGMxYjJiYzIwMWE2MTFkNDg0MTgzZDBhEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1U3h7mjPHn2fQ46I-tPBeigGprAwYGIolYoSb-7CptwVVWoVSrv1GR0QXxTlJqK1X1TYP7BhT8sj97n45fDhQGO0F-occ6nqDburFhKQ7qJ11JrrC4XmlRzScyvLGmGr-S1RPDfQjxW78q5RvxhQgwjoVbuuhKWTqelqRgxMxir4Gt0KHhCZupprwa1hjxIUOSheeAoNaOjzRppPKuR-VaygC2X6j9bMSFEr4t9Ha4n4GUmyCtoPg5abAU" }
  },
  {
    name: "projects/5929619357992091792/screens/f8706b0998a545c59d9cfc794452cddd",
    title: "BharatAI - Traveler Profile & Preferences",
    deviceType: "DESKTOP",
    width: "2560",
    height: "4762",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyNTJiYjdlNjUwNGVhYTdjYTFkMTZkY2IxEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1UH25RrH-Npten5rDufGXMzxtW2aWyTWqYA6YGTqH5qSticyhd0WSsDi0lO2xv0E8Wuggn5I-GTk2YQaNH23jLLU4905s-_hroSDHA5ql-AberhpKu0nSmoLkYcOZ_XH7HTmOGYQn_gzLubBwC6BCwdyytazKvwi7hlpB79ZxstUenKvRQ3LLrFtpQh5ScwYg-gi7gw7uXNIOe2saX7BtL8dzNTHBeaNAM9zgURfQ2iFeVZPU9bcgbYEw" }
  },
  {
    name: "projects/5929619357992091792/screens/98001f9ed7f0462f9917c7bdcf9b8ea3",
    title: "BharatAI - Login (Desktop)",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2048",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyN2I5M2E3NGQwN2M0ZGY0MTY3MDdkZTYxEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1VFMuJ_4G2J9X0bWfNDBBOgRndZDlLhIj_31zFzaMSQFNuFiAEgLZVG1AfmvswUOdsgy_hm7WFydg5gd8lxbuV4GviaFYkVZ0jWZNOEEatys9PyBMu9F2JBRTKhDnTUlSTI6pXUIUbQ-r3kbn7-0MaMBnSbC6jG0Dm5_vTOdHLiKt9TuJl7ZP1rit3kQQOJPsstHNNnE9ANCND98qwjqkPi39O18s4ZIYGEQYZrcB1-IdYyaeemIir3rg" }
  },
  {
    name: "projects/5929619357992091792/screens/4fd7451e74c74bbeb657702bb109a368",
    title: "BharatAI - Login (Mobile)",
    deviceType: "MOBILE",
    width: "780",
    height: "1768",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyN2JjODE2NGMwN2M0ZDk5NGU4MTA3M2YwEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WKQLyvyWlXm5JfCF_EQ2C1A3WknP1sTzEMJ0JXCmoMaXuxw5XEMaAIumOist5DaXfPT0-9OVyYjOjltG7hzi7nGEtXFCGhkfPyfOzKLbCXv0CkFa0milEPjXXIcmWSiF85L6Gnf_pjRqgIGHYGgIO2FL2NN-FxQoNG5hZC9OjISyxumHApMEEct-QyjhB_FVLOmUATKbo-K86XDfjTDCqCFPvJew6poOjKEcAi0d1bZBywwCCKhX_yDg" }
  },
  {
    name: "projects/5929619357992091792/screens/b4714fccaee4435cb149409dc9236242",
    title: "BharatAI - Registration (Desktop)",
    deviceType: "DESKTOP",
    width: "2560",
    height: "2172",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyODFhYmIwMDQwNzNhYzczZDNjMmFlOWYyEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1Uh4O-faGgUpqshbjrImEmvEMmA1gbwv9pbLqSwfgIVSUD8qg4WPPj8W7YcGc22cDFbBQ4XwoS3hHdeRqBUrCy3OULGALD7ExFlAqDNT9L0N02qGbg5VaJ0V3lnDAKD8nz9A0OLYfbp2TgGt61eCN_asz2m8bgnOJ9izmjCKoAriAUXUa1RotUrzIyOEL4bAtwoC2WL4c1m3pDmZTrTvKuGgPYTuCqVXwcSWJuWOmuv6m6V8bKCNkF0Lxg" }
  },
  {
    name: "projects/5929619357992091792/screens/2b27c1d2e4be4cde89c7aabee61789d6",
    title: "BharatAI - Registration (Mobile)",
    deviceType: "MOBILE",
    width: "780",
    height: "2002",
    htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1YTAyODJlOWIwZWEwNzc5YTQ2NTUyMDVkZGZkEgsSBxD24vSByw8YAZIBIwoKcHJvamVjdF9pZBIVQhM1OTI5NjE5MzU3OTkyMDkxNzky&filename=&opi=89354086" },
    screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/AEtjO1WorcvEXpRcINUT7CRjShQ8RY0DA1xJ1Yj0BUODCHTvEq5v_PwwNL1c2Y1CRmInBBR-hgR-jmXlUuC1MCQJSsvpHQ8OBBppVsyoARuTc6XFWqsw66hSgECK7jzL3vFQqS1FZoP_0MYN7u3qQLZexjQbHEtUSCbWrhhEYtrAowKfk-kh0pvNKBY5QDPmXJTelNt9kx1DjPOQBiOIRSQm0Y4kXDMrUMqlFtT2HH7g7So_y1NzRccY6A-21zM" }
  }
];

function sanitizeFilename(title: string, screenId: string): string {
  let clean = title
    .toLowerCase()
    .replace(/^bharatai\s*-\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${clean || 'screen'}-${screenId.slice(0, 8)}`;
}

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed with status ${res.statusCode} for ${url}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const frontendDir = path.join(rootDir, 'frontend');
  const screensDir = path.join(frontendDir, 'screens');
  const screenshotsDir = path.join(frontendDir, 'assets', 'screenshots');

  fs.mkdirSync(screensDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log(`Starting download of ${SCREENS_DATA.length} screens from Stitch project 5929619357992091792...`);

  const manifest: Array<{
    id: string;
    title: string;
    category: string;
    deviceType: string;
    filename: string;
    screenshotFilename: string;
    width?: string;
    height?: string;
  }> = [];

  for (const screen of SCREENS_DATA) {
    const screenId = screen.name.split('/').pop() || 'screen';
    const baseSlug = sanitizeFilename(screen.title, screenId);
    const htmlFilename = `${baseSlug}.html`;
    const screenshotFilename = `${baseSlug}.png`;

    console.log(`Processing: "${screen.title}" -> ${htmlFilename}`);

    // Download HTML
    if (screen.htmlCode?.downloadUrl) {
      try {
        const htmlBuffer = await fetchUrl(screen.htmlCode.downloadUrl);
        fs.writeFileSync(path.join(screensDir, htmlFilename), htmlBuffer);
        console.log(`  ✓ HTML downloaded (${htmlBuffer.length} bytes)`);
      } catch (err) {
        console.error(`  ✗ Error downloading HTML for ${screen.title}:`, err);
      }
    }

    // Download Screenshot
    if (screen.screenshot?.downloadUrl) {
      try {
        const imgBuffer = await fetchUrl(screen.screenshot.downloadUrl);
        fs.writeFileSync(path.join(screenshotsDir, screenshotFilename), imgBuffer);
        console.log(`  ✓ Screenshot downloaded (${imgBuffer.length} bytes)`);
      } catch (err) {
        console.error(`  ✗ Error downloading screenshot for ${screen.title}:`, err);
      }
    }

    // Categorization
    let category = "Core";
    const lower = screen.title.toLowerCase();
    if (lower.includes('planner') || lower.includes('itinerary')) category = "AI Planning";
    else if (lower.includes('explore') || lower.includes('hampi') || lower.includes('experience')) category = "Discovery";
    else if (lower.includes('map')) category = "Maps & Navigation";
    else if (lower.includes('budget') || lower.includes('safety') || lower.includes('accessibility')) category = "Intelligence Suite";
    else if (lower.includes('login') || lower.includes('registration') || lower.includes('profile') || lower.includes('journeys') || lower.includes('saved') || lower.includes('trips')) category = "User & Account";

    manifest.push({
      id: screenId,
      title: screen.title,
      category,
      deviceType: screen.deviceType || 'DESKTOP',
      filename: htmlFilename,
      screenshotFilename: screenshotFilename,
      width: screen.width,
      height: screen.height,
    });
  }

  // Save manifest
  const manifestPath = path.join(frontendDir, 'screens-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nSuccessfully generated manifest with ${manifest.length} screens at: ${manifestPath}`);
}

main().catch(console.error);
