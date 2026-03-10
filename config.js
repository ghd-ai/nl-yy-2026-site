/* global window */

// 你可以只改这个文件：改名字、改文案、换素材路径、换题面与答案。
// 注意：这是静态网页，素材需要你自己放到 assets/ 目录下（见 assets/README.md）。

window.MYSTERY_BIRTHDAY_CONFIG = {
  storageKey: "mystery_birthday_v1",
  meta: {
    title: "零点档案",
    subtitle: "月月专案 · 农历二月初四",
  },
  people: {
    recipientName: "刁良婷",
    recipientNickname: "月月",
    birthdayText: "农历二月初四",
    senderName: "我",
  },
  scoring: {
    startPoints: 100,
    hintCosts: { tier1: 0, tier2: 5, tier3: 15 },
    tier1CooldownSec: 60,
    wrongAttemptThreshold: 3,
    wrongAttemptPenalty: 2,
  },
  settings: {
    volume: 0.7,
    subtitles: true,
    reduceMotion: false,
    skipRewards: false,
  },
  media: {
    menuBgm: "assets/audio/bgm/happy-birthday.aac",
    warmBgm: "assets/audio/bgm/happy-birthday.aac",
    // 如果你还没准备音频素材，会自动回退到这个内置旋律（无需任何文件）。
    // 你也可以设为空字符串 "" 来禁用回退。
    fallbackBgm: "builtin:happy-birthday",
  },
  final: {
    title: "结案 · 记忆归还",
    // 终章照片：推荐用 gallery 数组（可放 10～100+ 张，支持给每张写一句弹幕）。
    // src 写图片路径；caption 可选（用于自动放映字幕/照片墙备注）。
    gallery: [],
    // 兼容旧版：如果你更想用“自动编号”方式，可以启用下面两项（gallery 为空时才会生效）。
    photoCount: 110,
    photoPattern: "assets/img2/{N}.jpg",
    // 终章背景音乐：按顺序循环播放（可放多首）。
    // 注意：浏览器通常会限制自动播放；需要先点一次“接受委托（解锁音轨）”。
    bgmPlaylist: [
      "assets/全网最多人用的《生日快乐》就是这个版本啦 祝你生日快乐/2-全网最多人用的《生日快乐》就是这个版本啦 祝你生日快乐-480P 标清-AVC.aac",
      "assets/生日快乐 生日祝福歌 海底捞/5-海底捞版-生日快乐-480P 标清-AVC.aac",
      "assets/“终于找到适合生日放的歌啦！”《Happy Birthday.》/戴上耳机/83-“终于找到适合生日放的歌啦！”《Happy Birthday.》-480P 标清-AVC.aac",
    ],
    // 自动放映（星光记忆放映厅）可选配置：
    // - msPerPhoto：每张停留毫秒数（2600～9000），不填则按总时长自动分配
    // - targetTotalMs：总时长（毫秒），不填默认约 52 秒
    // reel: { msPerPhoto: 4800, targetTotalMs: 52000 },
    blessings: [
      // 🌟 青春与人生愿景（平视的鼓励与赞美）
      "月月，生日快乐！愿你每一次热爱都有回响。",
      "新的一岁，愿你做自己世界里的大女主，勇敢且自由。",
      "不被定义的 22 岁，你只管负责开心，剩下的交给时间。",
      "愿你拥有说走就走的勇气，和随时从头再来的底气。",
      "愿你历经千帆，依然是那个爱笑爱闹的无敌美少女。",
      "不要害怕试错，年轻最大的资本就是可以随时重启。",
      "愿你眼里有光，心中有爱，目光所及皆是美好。",
      "22岁，去爱、去体验、去大笑，去拥抱无限可能的未来。",
      "继续去发光吧，哪怕只是微光，也能照亮属于你自己的宇宙。",

      // 👭 陪伴与依靠（好朋友/家人的绝对偏爱）
      "不管长到多大，你永远有做个快乐小朋友的特权。",
      "尽管去飞吧，祝你鹏程万里，也愿你岁岁平安。",
      "你的22岁，值得所有最温柔的晚风和最甜的草莓蛋糕。",
      "祝你不仅生日快乐，还要日日快乐、岁岁平安。",
      "今天你是全宇宙最可爱的限定寿星，不接受反驳！",

      // 🎤 爱好篇：摄影、唱歌与悬疑（懂她的奇奇怪怪）
      "愿你的生活永远有最动听的 BGM，拿起麦克风就是全场最亮的光。",
      "你用镜头记录了那么多美好，今天，换我们来记录最美的你。",
      "把烦恼关进抽屉，把照片贴满墙壁，把温柔留给明天。",
      "你的快门按下的每一瞬，都是时光留给你最珍贵的明信片。",
      "名侦探月月，愿你永远保持敏锐的直觉，看破生活的迷雾！",
      "愿你破解得了悬疑剧里的密室，也解得开生活里的所有盲盒。",
      "22岁的剧本已经翻开，愿你的每一帧画面都精彩绝伦。",

      // 🏃 努力篇：学业、志愿与比赛（懂她的辛勤付出）
      "那些熬夜爆肝改报告、迎着晨光做志愿的日子，时光都替你记得。",
      "所有你曾付出的善意，都会在未来化作星星落在你身上。",
      "商战推演时的你运筹帷幄，生活里的你也一定是当之无愧的 MVP。",
      "荣誉和奖杯固然闪耀，但在我们眼里，为了目标全力拼搏的你才最耀眼。",
      "愿你所有的努力都不被辜负，所有的付出都能开花结果。",
      "这一年学业辛苦啦！今天把所有 DDL 暂时清空，尽情享受你的专属零点！",

      // 😄 轻松幽默日常（陪她一起干饭）
      "祝可爱的月月每天都能睡到自然醒，干饭永远香！",
      "愿你的快乐电量永远满格，烦恼统统不在服务区！",
      "没有什么是吃一顿好吃的解决不了的，如果有，那就吃两顿！",
      "一岁一礼，一寸欢喜。生日快乐，未来可期。",
      "愿时光能缓，愿故人不散，愿你惦念的人能和你道晚安，愿你独闯的日子里不觉得孤单。",
      "但愿这漫长渺小的人生，不负你每个光辉时分。",
      "希望你能走过山山水水，写温柔的字，坦荡地爱，希望你被阅读，不被辜负。你要一直美丽，活得丰盛、热烈。",
      "至于未来会怎样，要用力走下去，才知道，记住先变成更喜欢的自己，再遇到一个不需要取悦的人。",
      "经历世事而不失少年意趣，保持坚定与热爱，依然能够为世间真情而心动。",
      "愿你一生努力，一生被爱，想要的都拥有，得不到的都释怀，只愿你被这世界温柔对待。",
      "愿你所爱之人，挚爱你一人，愿你往后路途，深情不再枉付。",
      "愿你夜里有灯，梦里有人，平安喜乐，得偿所愿。",
      "所有人都祝你生日快乐，我只愿你遍历山河，觉得人间值得。",
      "愿你能在人海茫茫中，和你的命中注定撞个满怀。",
      "愿你的快乐与岁月无关，你的纯真与经历无关，沧海桑田后依旧乘风破浪，尘埃落定后依旧炙热欢畅。",
      "愿成长，落落大方，枯木逢春，不负众望。",
      "天上星辰应作伴，人间可爱不知年。",
      "愿从今后八千年，长似今年，长似今年。",
      "你且听这荒唐，春秋走来一步步，你且迷着风浪，永远二十赶朝暮，将昨日事，归欢喜处。",
      "愿你去往之地皆为热土，愿你将遇之人皆为挚友。",
      "几见花开，一任年光换，今年见，明年重见，春色如人面。",
      "愿亲爱的你，经历世事而不失少年意趣，保持坚定与热爱，依然能够为世间那些真心实意而心动。还有，生日快乐呀！",
      "渐入佳境，大概是我对人生最好的祝愿了。",
      "祝少年不老，祝自尊和爱情两全，祝所有想触碰又收回的手，最终都能紧紧牵在一起。",
      "美好的事物一定会在新的一岁如约而至。",
      "愿祝椿龄不老秋，名并庄周。",
      "愿意诚挚之心，领岁月之教。",
    ],
  },
  cases: [
    {
      id: "case1",
      order: 1,
      title: "消失的许愿光",
      subtitle: "升级版逻辑推演：先排布派对物料，再锁定人物站位，找出谁拿着月光烛台。",
      type: "einstein-logic",
      observationSec: 150,
      deductionSec: 360,
      rewardText: "",
      hints: {
        tier1:
          "先排布连续的道具：线索指出【生日横幅 → 月光烛台 → 铝箔气球】必须是紧挨着的三连；再结合“横幅不在书房/走廊”，用排除法确定这三样东西落在哪三个房间。",
        tier2:
          "道具三连只能落在【卧室(横幅)→客厅(烛台)→阳台(气球)】；剩下的【惊喜投影仪→派对礼花筒】自然在【书房→走廊】。接着看人物：东代码在投影仪那间，辰统筹在横幅那间，俊魔术在菲镜头右边但不是最右。",
        tier3:
          "真相：书房(东代码+投影仪)；走廊(菲镜头+礼花筒)；卧室(辰统筹+横幅)；客厅(俊魔术+月光烛台)；阳台(冬贪吃+铝箔气球)。拿着烛台的是俊魔术。",
      },
      assets: {
        bgm: "assets/audio/bgm/happy-birthday.aac",
        interlude: {
          type: "image",
          src: "assets/ai/interlude/case1.png",
          title: "AI 小剧场：许愿光回收",
          text: "WISHLIGHT TRACE · LOCKED",
          fx: "scan",
        },
        video:
          "assets/一段可以用作生日祝福的剪辑视频，送粉丝的伴手礼。/2-一段可以用作生日祝福的剪辑视频，送粉丝的伴手礼。-480P 标清-AVC.mp4",
      },
      data: {
        caseName: "月月顶牛庆生夜·消失的许愿光",
        detective: "月月侦探 (Detective Yue)",
        setup:
          "拦截到加密通讯：有人窃取了零点派对的核心道具“月光烛台”。请通过安保线索，将 5 个嫌疑人和 5 件派对物料放入正确的房间，找出烛台的下落。提示：先排布物证（注意那些要求紧挨着的线索），再锁定人物站位。最后，点选你认为拿着烛台的人，并点击【验证探针】校验。",
        notebookTitle: "侦探笔记 · 线索本",
        clues: [
          "线索 1：【生日横幅】不在书房，也不在走廊。",
          "线索 2：【月光烛台】在【生日横幅】右边紧挨着的房间。",
          "线索 3：【铝箔气球】在【月光烛台】右边紧挨着的房间。",
          "线索 4：【派对礼花筒】在【惊喜投影仪】右边紧挨着的房间。",
          "线索 5：东代码和【惊喜投影仪】在同一间房。",
          "线索 6：辰统筹和【生日横幅】在同一间房。",
          "线索 7：俊魔术的房间在菲镜头右边，但不是最右侧那间。",
          "任务：找出谁拿着月光烛台。",
        ],
        memoryKey: "记忆档案室",
        notebookButtonText: "皮质线索本（点击打开）",
        voteButtonText: "验证探针 · 去校验",
        rooms: [
          { id: "study", name: "书房", icon: "📚", note: "" },
          { id: "corridor", name: "走廊", icon: "🚪", note: "" },
          { id: "bedroom", name: "卧室", icon: "🛏️", note: "" },
          { id: "living", name: "客厅", icon: "🛋️", note: "" },
          { id: "balcony", name: "阳台", icon: "🌙", note: "" },
        ],
        suspects: [
          {
            id: "dong",
            name: "东代码",
            role: "技术小白 / 安保后台",
            line: "别催，还差最后一个 Bug！",
            avatar: "👓",
            correctItemId: "projector",
            correctRoomId: "study",
          },
          {
            id: "winter",
            name: "冬贪吃",
            role: "气氛组 / 吃货",
            line: "我没偷烛台！我在给气球打气……真的。",
            avatar: "🎈",
            correctItemId: "balloon",
            correctRoomId: "balcony",
          },
          {
            id: "chen",
            name: "辰统筹",
            role: "强迫症导演 / 总控",
            line: "横幅要挂正！歪一度我都难受。",
            avatar: "📋",
            correctItemId: "banner",
            correctRoomId: "bedroom",
          },
          {
            id: "fei",
            name: "菲镜头",
            role: "首席摄影 / 现场记录",
            line: "别眨眼，礼花和镜头都已经就位。",
            avatar: "📷",
            correctItemId: "popper",
            correctRoomId: "corridor",
          },
          {
            id: "jun",
            name: "俊魔术",
            role: "宝藏男孩，口头禅是谢谢",
            line: "这就是见证奇迹的时刻。",
            avatar: "✨",
            correctItemId: "candle",
            correctRoomId: "living",
          },
        ],
        items: [
          { id: "projector", name: "惊喜投影仪", icon: "📽️" },
          { id: "popper", name: "派对礼花筒", icon: "🎉" },
          { id: "banner", name: "生日横幅", icon: "🎀" },
          { id: "candle", name: "月光烛台", icon: "🕯️" },
          { id: "balloon", name: "铝箔气球", icon: "🎈" },
        ],
      },
      solution: {
        keyOrder: [1, 2, 3, 5, 6, 4],
        culpritId: "jun",
        revealText:
          "【真相大白】你推开了客厅的门，抓住了拿着月光烛台的俊魔术。但这里并没有时间窃贼——东代码在书房调试投影仪，菲镜头在走廊准备拉响礼花，辰统筹在卧室挂生日横幅，而冬贪吃正在阳台给气球打气。\n\n原来，所有的“嫌疑人”都在为你偷偷筹备零点派对！\n\n【系统提示】：你在月光烛台的底座上，发现了一枚写着『记忆档案室』的芯片。要想找回丢失的时光，你需要立刻前往【第二关：思维殿堂】，去重构那些散落的记忆。",
      },
    },
    {
      id: "case2",
      order: 2,
      title: "思维殿堂 · 记忆重构",
      subtitle: "12 个记忆胶囊（每月一张）：按照片的先后顺序，把它们重新连起来。",
      type: "mind-palace",
      observationSec: 120,
      deductionSec: 240,
      rewardText:
        "时间线闭环。你把这一年的光，重新连成了两段。",
      hints: {
        tier1: "先在“观察”阶段把 12 张照片都看一遍；进入“推理”后再按先后顺序依次连线（连错会重置）。",
        tier2: "卡住时：先找“最早的一张”和“最晚的一张”当锚点，再用衣服/光线/场景细节把中间补齐。",
        tier3: "顺序就是：第一张→第二张→…→第十二张。口令会拼成：MOON22。",
      },
      assets: {
        bgm: "assets/时间煮雨/1021_s_0bc37z4lqmibzeajnpc4bzt357wdxc3qcm2a.f0.m4a",
        interlude: {
          type: "image",
          src: "assets/ai/interlude/case2.png",
          title: "AI 小剧场：记忆坐标回放",
          text: "MEMORY CAPSULES · RECONSTRUCT",
          fx: "holo",
        },
        video: "assets/gemini歌曲/月月生日快乐_Yueyue_Shengri_Kuaile_.mp4",
      },
      data: {
        intro:
          "时间窃贼把你这一年的 12 段记忆封进了胶囊里。规则只有一个：按照片的先后顺序连接。先慢慢看完，再开始连线。",
        // 不显示月份/时间戳，避免“看一眼就知道答案”。
        nodeLabelMode: "tag", // "none" | "tag" | "label"
        showStamp: false,
        showKicker: false,
        // 你可以把 memories 改成 8～20 张：只要 order 能排序即可（或用 date）。
        // 这里用 order=1..N 来表达“先后顺序”，不会出现在 UI 上。
        memories: [
          { id: "P01", order: 1, img: "assets/第二关卡照片/第一张.jpg", letter: "M" },
          { id: "P02", order: 2, img: "assets/第二关卡照片/第二张.jpg", letter: "O" },
          { id: "P03", order: 3, img: "assets/第二关卡照片/第三张.jpg", letter: "O" },
          { id: "P04", order: 4, img: "assets/第二关卡照片/第四张.jpg" },
          { id: "P05", order: 5, img: "assets/第二关卡照片/第五张.jpg" },
          { id: "P06", order: 6, img: "assets/第二关卡照片/第六张.jpg" },
          { id: "P07", order: 7, img: "assets/第二关卡照片/第七张.jpg" },
          { id: "P08", order: 8, img: "assets/第二关卡照片/第八张.jpg" },
          { id: "P09", order: 9, img: "assets/第二关卡照片/第九张.jpg" },
          { id: "P10", order: 10, img: "assets/第二关卡照片/第十张.jpg", letter: "N" },
          { id: "P11", order: 11, img: "assets/第二关卡照片/第十一张.jpg", letter: "2" },
          { id: "P12", order: 12, img: "assets/第二关卡照片/第十二张.jpg", letter: "2" },
        ],
      },
      solution: {
        passphrase: "MOON22",
        revealText: "时间线闭环已构建。你得到口令：{passphrase}",
      },
    },
    {
      id: "case3",
      order: 3,
      title: "未拆封的第 22 号档案",
      subtitle: "生活的炼金术：用紫外线探照灯照出四个首字母，在机密终端输入口令。",
      type: "alchemy-wish",
      observationSec: 180,
      deductionSec: 180,
      rewardText:
        "【第 22 号档案：封存】那些让你焦虑的 (Worry)，终将变成智慧 (Wisdom)；那些看似伤害的 (Injury)，终将点燃光芒 (Ignite)；那些深夜的压力 (Stress)，终将化作力量 (Strength)；那些暂时的停滞 (Halt)，都孕育着希望 (Hope)。",
      hints: {
        tier1: "先用白光看清“冷光鉴定”，再点下方「紫光」深度解密：暖光文字末尾会出现“? 提取特征码”。",
        tier2: "桌面上会出现 7 个特征码，但终端只要 4 位。挑出代表“核心力量”的 4 个字母，再进行重组。",
        tier3: "口令是：WISH；同时你会拿到案件编号：1324（用于第 5 关映射）。",
      },
      assets: {
        bgm: "assets/大鱼/1021_s_0bc35zrn4mi3feanqucehztkj3wd32trwvka.f0.m4a",
        interlude: {
          type: "image",
          src: "assets/ai/interlude/case3.png",
          title: "AI 小剧场：档案 #22 · 紫外检视",
          text: "UV TRACE · FILE #22",
          fx: "uv",
        },
        video: "assets/中国式浪漫：用古诗词说生日快乐/108-中国式浪漫：用古诗词说生日快乐-480P 标清-AVC.mp4",
      },
      data: {
        fileNo: "22",
        intro:
          "档案室守则：眼见不一定为实。桌面散落着 7 份微物证据，用紫外线探照灯（鼠标）仔细甄别。找出能代表你这一年“核心力量”的 4 份样本，提取它们的特征码并进行重组，解锁下方机密终端。",
        terminalPrompt: "请输入 4 位核心特征密码：",
        evidences: [
          {
            id: "EV_S",
            code: "03",
            letter: "S",
            x: "14%",
            y: "52%",
            xSm: "6%",
            ySm: "50%",
            rotate: "2deg",
            w: "560px",
            wSm: "88vw",
            z: 1,
            coldWord: "Stress",
            warmWord: "Strength",
            name: "深夜消费清单",
            nameEn: "Receipt",
            icon: "🧾",
            featured: true,
            coldTitle: "【初步鉴定】",
            coldText:
              "监测到多线程任务（保研/考研/考公）冲突。\n系统长期超载，方向混乱。\n判定：存在随时崩盘风险。",
            warmTitle: "【深度解密】",
            warmText:
              "这不是混乱，这是破釜沉舟的 Strength（力量）。\n饱和式救援，岸边一定鲜花盛开。",
          },
          {
            id: "EV_H",
            code: "22",
            letter: "H",
            x: "58%",
            y: "58%",
            xSm: "8%",
            ySm: "76%",
            rotate: "-8deg",
            w: "340px",
            wSm: "84vw",
            z: 2,
            coldWord: "Halt",
            warmWord: "Hope",
            name: "碎裂的怀表",
            nameEn: "Clock",
            icon: "⏱️",
            coldTitle: "【初步鉴定】",
            coldText:
              "齿轮严重锈蚀，指针停滞。\n功能完全失效，已被时间抛弃。\n判定：无修复价值。",
            warmTitle: "【深度解密】",
            warmText:
              "它没有坏，只是想为你按下暂停键。\n深呼吸，Hope（希望）就在下一秒。",
          },
          {
            id: "EV_W",
            code: "07",
            letter: "W",
            x: "8%",
            y: "10%",
            xSm: "8%",
            ySm: "8%",
            rotate: "-6deg",
            w: "360px",
            wSm: "84vw",
            z: 3,
            coldWord: "Worry",
            warmWord: "Wisdom",
            name: "烧焦的残页",
            nameEn: "Burnt Page",
            icon: "🗓️",
            coldTitle: "【初步鉴定】",
            coldText:
              "时间样本严重碳化。\n监测到明显的不可逆衰老特征。\n判定：年龄焦虑残留。",
            warmTitle: "【深度解密】",
            warmText:
              "碳化是因为你燃烧得足够热烈。\n这不是衰老，是岁月沉淀的 Wisdom（智慧）。",
          },
          {
            id: "EV_I",
            code: "12",
            letter: "I",
            x: "64%",
            y: "14%",
            xSm: "8%",
            ySm: "28%",
            rotate: "10deg",
            w: "320px",
            wSm: "84vw",
            z: 2,
            coldWord: "Injury",
            warmWord: "Ignite",
            name: "喷射状污渍",
            nameEn: "Stain",
            icon: "🩸",
            coldTitle: "【初步鉴定】",
            coldText:
              "疑似生物痕迹，具高度危险性。\n现场混乱，难以清洗。\n建议立即隔离封存。",
            warmTitle: "【深度解密】",
            warmText:
              "警报解除，这是草莓果酱的甜渍。\n这一年或许有狼狈，但终将 Ignite（点燃）你的光芒。",
          },
        ],
        distractions: [
          {
            id: "DM_PEN",
            code: "15",
            letter: "D",
            icon: "🖊️",
            name: "散落的金属管",
            nameEn: "Metal Tube",
            x: "38%",
            y: "25%",
            xSm: "10%",
            ySm: "18%",
            rotate: "22deg",
            w: "280px",
            wSm: "72vw",
            z: 2,
            coldTitle: "【凶器比对】",
            coldText: "尖锐金属物，尖端磨损严重。\n带有扎刺划痕，疑似作案工具。",
            warmTitle: "【深度解密】",
            warmWord: "Dry",
            warmText:
              "一支没墨水的笔。鉴定为：Dry（枯竭）。\n没灵感换一支就好，无需过度内耗。",
          },
          {
            id: "DM_COFFEE",
            code: "09",
            letter: "C",
            icon: "☕",
            name: "黑色不明液体",
            nameEn: "Unknown Liquid",
            x: "48%",
            y: "45%",
            xSm: "10%",
            ySm: "38%",
            rotate: "14deg",
            w: "280px",
            wSm: "72vw",
            z: 2,
            coldTitle: "【毒物筛查】",
            coldText: "杯底发现黑色不明液体残留。\n疑似抑制神经中枢的慢性毒素。",
            warmTitle: "【深度解密】",
            warmWord: "Caffeine",
            warmText: "纯黑冰美式。鉴定为：Caffeine（咖啡因）。\n破案的唯一续命药，但不是今天的核心。",
          },
          {
            id: "DM_PAPERCLIP",
            code: "05",
            letter: "T",
            icon: "📎",
            name: "扭曲的金属丝",
            nameEn: "Twisted Wire",
            x: "78%",
            y: "42%",
            xSm: "10%",
            ySm: "62%",
            rotate: "-18deg",
            w: "240px",
            wSm: "72vw",
            z: 2,
            coldTitle: "【痕迹分析】",
            coldText: "极度扭曲的金属丝。\n疑似用于非法撬锁的自制工具。",
            warmTitle: "【深度解密】",
            warmWord: "Tired",
            warmText:
              "一枚普通的回形针。鉴定为：Tired（疲惫）。\n夹过太多复习资料，它该休息了。",
          },
        ],
      },
      solution: {
        password: "WISH",
        letters: "WISH",
        fragment: "WISH",
        caseNumber: "1324",
        revealText: "第 22 号档案已封存。你得到碎片：C [WISH]，以及案件编号：1324。",
      },
    },
    {
      id: "case4",
      order: 4,
      title: "模仿犯的密信：法医滤镜",
      subtitle: "带一点《法医秦明》与《模仿犯》的冷感气质：在法医检视台上，破解时间窃贼的终极挑衅。",
      type: "cardano-grille",
      observationSec: 150,
      deductionSec: 240,
      rewardText:
        "【法医鉴定结论】滤镜比对成功！所谓的“时间窃贼”，不过是你在志愿、调研和爱好中留下的充实轨迹。乱码褪去，只剩甜蜜。生日快乐，月月探员！快去吃蛋糕吧！",
      hints: {
        tier1: "法医科的多光谱检视台已开启。试着拖拽这 3 张带有孔洞的黑色滤镜，双击可以旋转它们。",
        tier2: "仔细看报告里的吐槽！【最底层+向右】=放在右下角；【180遍+最上面】=旋转180度放最上面；【90度+心在中间】=旋转90度放正中间。",
        tier3: "三张滤镜叠对后，孔洞中会显现出 4 个字母。输入它们组合成的单词 (CAKE)，检视台上会为你变出一个真正的蛋糕！",
      },
      assets: {
        bgm: "assets/云烟成雨/1021_s_0bc36hpvumngpqae7bg66ztbt4odlk4knuka.f0.m4a",
        interlude: {
          type: "image",
          src: "assets/ai/interlude/case4.png",
          title: "AI 小剧场：法医滤镜比对",
          text: "FORENSIC FILTER · MATCHED",
          fx: "scan",
        },
        video: "assets/【生日混剪】祝你生日快乐！Birthday show/1-【生日混剪】祝你生日快乐！Birthday show-480P 标清-AVC.mp4",
      },
      data: {
        intro:
          "首席法医，我们收到了模仿犯留下的 6x6 字母乱码信。不要盲猜！请阅读左侧对你日常行为的《法医侧写》，提取坐标线索。将右侧 3 张【光学漏格滤镜】进行旋转和拖拽，叠在乱码信上，过滤出最后的真相。",
        terminalPrompt: "请输入漏格中显现的 4 位终极密码：",
        reportText: `
          <div class="forensic-report forensic-report--cards space-y-4 text-sm leading-relaxed">
            <div class="forensic-report__head">
              <div class="forensic-report__title text-green-400 font-bold">【法医行为侧写档案】</div>
              <div class="forensic-report__meta mono">STATUS: CLASSIFIED // ACCESS LEVEL: OMEGA</div>
            </div>

            <div class="forensic-card forensic-card--a">
              <div class="forensic-card__row">
                <span class="forensic-icon" aria-hidden="true">📍</span>
                <strong class="forensic-card__title">滤镜 A：志愿活动轨迹</strong>
              </div>
              <p class="forensic-card__text">据监测，该探员做志愿时微信步数常霸占朋友圈<span class="text-white">最底层</span>；但一听见干饭，必定立刻向<span class="text-white">右</span>冲刺，且<span class="text-white">从不回头(0度)</span>。</p>
            </div>

            <div class="forensic-card forensic-card--b">
              <div class="forensic-card__row">
                <span class="forensic-icon" aria-hidden="true">📊</span>
                <strong class="forensic-card__title">滤镜 B：正大杯调研波形</strong>
              </div>
              <p class="forensic-card__text">因问卷改了<span class="text-white">180遍</span>，探员精神状态常发生<span class="text-white">180度翻转</span>。但她扬言：就算头秃，这杯子也必须端到<span class="text-white">最上面</span>！</p>
            </div>

            <div class="forensic-card forensic-card--c">
              <div class="forensic-card__row">
                <span class="forensic-icon" aria-hidden="true">💓</span>
                <strong class="forensic-card__title">滤镜 C：悬疑剧心率切片</strong>
              </div>
              <p class="forensic-card__text">半夜看悬疑剧，常被吓得在被窝里<span class="text-white">90度</span>鲤鱼打挺。但那颗热爱推理的心，始终放在<span class="text-white">正中央</span>。</p>
            </div>
          </div>
        `,
        filters: [
          { id: "filter-a", name: "滤镜A (右下)" },
          { id: "filter-b", name: "滤镜B (顶端)" },
          { id: "filter-c", name: "滤镜C (中央)" },
        ],
      },
      solution: {
        password: "CAKE",
        fragment: "CAKE",
        revealText: "密码验证通过！光学滤网褪去伪装，一个巨大的生日蛋糕浮现在检视台上。你获得了第 4 枚碎片：CAKE。",
      },
    },
    {
      id: "case5",
      order: 5,
      title: "星空漫游：夜间拾音记录",
      subtitle:
        "借一点《跳一跳》的起跳手感：蓄力，起跳！跟着《摩天大厦夜间拾音记录》走向【星空花园】，把散落的通行碎片一枚枚找回来。",
      type: "jump-and-jump",
      observationSec: 150,
      deductionSec: 240,
      rewardText:
        "所有的谎言和冰冷的大楼都是伪装。推开最后这扇门，有一群在【星空花园】吹着温柔的晚风、守着蛋糕、等你等了一整夜的家人和朋友。22岁生日快乐，月月！",
      hints: {
        tier1:
          "每个小关卡只有两个方向：先点一下选择左/右路线，然后长按蓄力起跳。路线中要连续跳过几个方块才到终点；中途失手会回到本小关卡起点重来。",
        tier2:
          "像微信《跳一跳》：路线里每次只出现一个“下一块”。按得越久跳得越远，完全靠眼睛判断距离与手感。",
        tier3:
          "别急着点路线：先读左侧《拾音记录》。键盘/脚步/反转/高歌/快门——每一段“声音切片”都在暗示哪一侧终点藏着碎片。",
      },
      assets: {
        bgm: "assets/星辰大海/1021_s_0b53zf6vkmiegyalro24vftlxsodkwaajxsa.f0.m4a",
        interlude: {
          type: "image",
          src: "assets/ai/interlude/case5.png",
          title: "AI 小剧场：星空花园入口",
          text: "STAR GARDEN · SIGNAL FOUND",
          fx: "sparkle",
        },
        video: "assets/生日快乐，动漫混剪。/1-生日快乐，动漫混剪。-480P 标清-AVC.mp4",
      },
      data: {
        word: "HAPPY",
        chargeMs: 1600,
        routeHopsMin: 3,
        routeHopsMax: 5,
        intro:
          "《摩天大厦》夜深了。电梯的每一次停靠，都留下一段“白噪音”。请根据《夜间拾音记录》做出判断：在 5 次跳跃里找齐通行碎片，最后抵达【星空花园】。",
        audioLogs: [
          {
            id: "拾音记录 1",
            text: "听到噼里啪啦敲击键盘的声音，伴随着一句魔性的洗脑口诀，主人似乎正在死磕某项受访者数据的逻辑。",
          },
          {
            id: "拾音记录 2",
            text: "传来了有些疲惫却轻快的脚步声。她今晚似乎没在书桌前枯坐，而是刚刚把温暖和善意送给了很多人。",
          },
          {
            id: "拾音记录 3",
            text: "一阵紧张压抑的背景音乐后，传来一声清脆的拍桌声：‘我就知道这集他会反转！’",
          },
          {
            id: "拾音记录 4",
            text: "不是塞着耳机安静聆听的白噪音，而是有人握着什么东西，全情投入地大声唱了出来。",
          },
          {
            id: "拾音记录 5",
            text: "比起翻阅泛黄的旧纸张，这里传来的更多是‘看镜头，笑一个’的清脆快门声。",
          },
        ],
        steps: [
          {
            left: {
              id: "沙盘推演室",
              icon: "🗺️",
              text: "商战里的你运筹帷幄。无论是资金流转还是破局策略，你都是当之无愧的操盘手。",
              fragment: "",
            },
            right: {
              id: "正大杯备战室",
              icon: "🏆",
              text: "『爱你老吉』的梗烂熟于心，无数次问卷修改，终将换来最耀眼的奖杯。",
              fragment: "H",
            },
          },
          {
            left: {
              id: "图书馆守望角",
              icon: "📚",
              text: "那些迎着晨光的早起，和披星戴月的晚归，时光都会记得你的每一分努力。",
              fragment: "",
            },
            right: {
              id: "志愿勋章室",
              icon: "🏃",
              text: "你的志愿时长是常人的几十倍。你总是把善意毫无保留地分给这个世界。",
              fragment: "A",
            },
          },
          {
            left: {
              id: "神秘盲盒屋",
              icon: "🎁",
              text: "精心挑选的盲盒与未知的惊喜。你只管负责开心，剩下的交给我们。",
              fragment: "",
            },
            right: {
              id: "悬疑放映厅",
              icon: "🧩",
              text: "从迷雾重重到真相大白，热爱推理的你，直觉永远敏锐，逻辑永远闪闪发光。",
              fragment: "P",
            },
          },
          {
            left: {
              id: "单曲循环室",
              icon: "🎧",
              text: "戴上耳机，把喧嚣隔绝在外。愿你在喜欢的旋律里，永远自由自在。",
              fragment: "",
            },
            right: {
              id: "麦霸 Live 现场",
              icon: "🎤",
              text: "拿起麦克风的瞬间，你就是全场最亮的光。愿你的生活永远有最动听的BGM。",
              fragment: "P",
            },
          },
          {
            left: {
              id: "时光相册档案馆",
              icon: "🖼️",
              text: "每一张存下来的照片，都是你不舍得忘记的温柔瞬间。",
              fragment: "",
            },
            right: {
              id: "摄影特写区",
              icon: "📷",
              text: "你总是喜欢用镜头记录美好，但今天，你是所有镜头里唯一的女主角。请对镜头说：茄子！",
              fragment: "Y",
            },
          },
        ],
      },
      solution: {
        password: "HAPPY",
        fragment: "HAPPY",
        revealText: "跳跃完美！你集齐了 HAPPY 密钥，电梯已直达星空花园。",
      },
    },
    {
      id: "case6",
      order: 6,
      title: "零点的许愿烛光",
      subtitle: "喧嚣落幕。现在，只差最后一个充满仪式感的动作……",
      type: "silence-final",
      observationSec: 120,
      deductionSec: 300,
      rewardText:
        "【全案终结：黎明已至】\n长夜终于破晓。所有的谜题、谎言和伪装，都在此刻结束。\n接下来，是属于刁良婷的专属时间。\n门外没有案发现场，只有全世界为你准备的祝福。\n愿以诚挚之心，领岁月之教。限定寿星，22 岁生日快乐！",
      hints: {
        tier1: "过生日许愿时，我们通常会做什么？闭上眼睛，安安静静地在心里默念愿望。",
        tier2: "这不仅仅是个比喻。请真正放下鼠标和手机，保持你的设备处于【绝对静止】状态。",
        tier3:
          "点击“准备许愿”后，双手离开设备 10 秒钟，什么都不要按，连鼠标都不要晃动（微风会把蜡烛吹灭）。\n最终口令 = 【路线口令】-【关键碎片】",
      },
      assets: {
        bgm: "assets/audio/bgm/happy-birthday.aac",
        video: "assets/即梦视频/生日彩蛋视频.mp4",
      },
      data: {
        holdSec: 10,
        terminalPrompt: "请输入最终口令（格式：路线口令-关键碎片）",
        finalAiImage: "assets/gemini人像/Gemini_Generated_Image_jgpryejgpryejgpr_processed.png",
        wishQuote: "门外没有案发现场，只有全世界为你准备的祝福。",
        intro: "所有的谜题都已解开。你推开门，朋友们捧着点燃了 22 根蜡烛的蛋糕走到你面前。",
        setup: "【许愿时刻】：朋友们安静了下来。接下来，请完成那个最重要的生日仪式吧。",
      },
      solution: {
        finalKeyFormat: "{case2Pass}-{case5Fragment}",
        revealText: "时间归还。档案解锁。",
      },
    },
  ],
};
