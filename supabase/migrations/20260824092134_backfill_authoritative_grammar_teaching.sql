-- Lesson activity groups are durable. A group generated before the curated
-- grammar bank was deployed can therefore be finalized later with its old
-- model-written teaching copy. Refresh every grammar pattern currently used by
-- a stored lesson from the same committed bank that the application uses.
with bank(pattern, structure, usage_notes, example, translation) as (
  values
    ('〜ながら', $bank$Verb ます-stem + ながら$bank$, $bank$Expresses doing two actions at the same time, with the action after ながら usually being the main one.$bank$, $bank$音楽を聞きながら勉強します。$bank$, $bank$I study while listening to music.$bank$),
    ('〜ようになる', $bank$Verb dictionary/ない-form + ようになる$bank$, $bank$Expresses a change in ability, habit, or state, meaning “come to/become able to.”$bank$, $bank$日本語が話せるようになりました。$bank$, $bank$I became able to speak Japanese.$bank$),
    ('あとで', $bank$Verb た-form + あとで
Noun + のあとで$bank$, $bank$Means “after/later,” showing that one action occurs following another.$bank$, $bank$映画を見たあとで、晩ご飯を食べました。$bank$, $bank$After watching the movie, we ate dinner.$bank$),
    ('あまり', $bank$あまり + Verb/Adjective
Noun + のあまり$bank$, $bank$Expresses an excessive degree or “too much”; in the form Nのあまり it can mean “because of too much...”$bank$, $bank$あまり食べると、おなかが痛くなります。$bank$, $bank$If you eat too much, your stomach will hurt.$bank$),
    ('うちに', $bank$Verb dictionary/ている/ない-form + うちに
い-adjective + うちに
な-adjective + なうちに
Noun + のうちに$bank$, $bank$Means “while/before a state changes,” often suggesting doing something while the opportunity exists.$bank$, $bank$若いうちに、いろいろな所へ旅行したいです。$bank$, $bank$I want to travel to many places while I am young.$bank$),
    ('お~ください', $bank$お + Verb ます-stem + ください$bank$, $bank$A respectful request form used to politely ask someone to do something.$bank$, $bank$こちらでお待ちください。$bank$, $bank$Please wait here.$bank$),
    ('か', $bank$Sentence + か
Noun + ですか
Verb + ますか
Adjective + ですか$bank$, $bank$Placed at the end of a sentence to turn it into a question, especially in polite Japanese.$bank$, $bank$これはあなたの本ですか。$bank$, $bank$Is this your book?$bank$),
    ('が', $bank$Noun + が + Verb/Adjective$bank$, $bank$Marks the grammatical subject, especially new information, existence, ability, likes, or a focused subject.$bank$, $bank$猫がいます。$bank$, $bank$There is a cat.$bank$),
    ('しか~ない', $bank$Noun + しか + Negative Verb$bank$, $bank$Means “nothing but” or “only,” and must be used with a negative predicate.$bank$, $bank$千円しかありません。$bank$, $bank$I only have 1,000 yen.$bank$),
    ('じゃない / ではない', $bank$Noun + じゃない / ではない
な-adjective + じゃない / ではない$bank$, $bank$Used to say that something is not something. じゃない is common in conversation; ではない is more formal.$bank$, $bank$今日は休みじゃない。$bank$, $bank$Today is not a day off.$bank$),
    ('だった / でした', $bank$Noun + だった / でした
な-adjective + だった / でした$bank$, $bank$Used to say that something was a certain thing or condition in the past. だった is plain; でした is polite.$bank$, $bank$昨日は休みでした。$bank$, $bank$Yesterday was a day off.$bank$),
    ('ている', $bank$Verb て-form + いる$bank$, $bank$Expresses an action in progress, a continuing state, or a habitual activity.$bank$, $bank$今、日本語を勉強しています。$bank$, $bank$I am studying Japanese now.$bank$),
    ('と言う', $bank$Quoted content + と言う$bank$, $bank$Marks direct or indirect quoted speech before the verb 言う, meaning “say that...”$bank$, $bank$田中さんは「また明日」と言いました。$bank$, $bank$Mr. Tanaka said, “See you tomorrow.”$bank$),
    ('まだ～ていない', $bank$まだ + Verb て-form + いない$bank$, $bank$Means “have not done yet,” emphasizing that an expected action remains incomplete.$bank$, $bank$宿題はまだ終わっていません。$bank$, $bank$I haven't finished my homework yet.$bank$),
    ('やすい', $bank$Verb ます-stem + やすい$bank$, $bank$Means “easy to do” or describes something that tends to happen easily.$bank$, $bank$このペンは書きやすいです。$bank$, $bank$This pen is easy to write with.$bank$),
    ('を', $bank$Noun + を + Transitive Verb$bank$, $bank$Marks the direct object of an action.$bank$, $bank$パンを食べます。$bank$, $bank$I eat bread.$bank$),
    ('以上', $bank$Number/Noun + 以上
Plain form + 以上$bank$, $bank$Means “at least/more than” with quantities; with a clause, it can also mean “now that/as long as.”$bank$, $bank$十八歳以上の人が入れます。$bank$, $bank$People aged eighteen or older may enter.$bank$),
    ('以下', $bank$Number/Noun + 以下$bank$, $bank$Means “not more than/at or below” a number, amount, rank, or standard.$bank$, $bank$十歳以下の子どもは無料です。$bank$, $bank$Children aged ten or younger are free.$bank$),
    ('以内', $bank$Number/Period + 以内
Noun + 以内$bank$, $bank$Means “within/no more than” a limit of time, distance, quantity, or range.$bank$, $bank$一週間以内に返してください。$bank$, $bank$Please return it within one week.$bank$),
    ('以外', $bank$Noun + 以外
Noun + 以外の + Noun$bank$, $bank$Means “except/besides/other than.”$bank$, $bank$日曜日以外は毎日働きます。$bank$, $bank$I work every day except Sunday.$bank$),
    ('間', $bank$Verb ている-form + 間
Noun + の間$bank$, $bank$Expresses that an action or state continues throughout a period of time, meaning “while/during.”$bank$, $bank$夏休みの間、毎日泳ぎました。$bank$, $bank$I swam every day during summer vacation.$bank$),
    ('間に', $bank$Verb ている-form + 間に
Noun + の間に$bank$, $bank$Expresses that another event occurs at some point within a continuing period, meaning “while/during the time that.”$bank$, $bank$母が料理している間に、宿題をしました。$bank$, $bank$I did my homework while my mother was cooking.$bank$)
)
update public.lesson_grammar as lesson
set
  structure = bank.structure,
  usage_notes = bank.usage_notes,
  example = bank.example,
  translation = bank.translation,
  updated_at = now()
from bank
where lesson.pattern = bank.pattern
  and (
    lesson.structure is distinct from bank.structure
    or lesson.usage_notes is distinct from bank.usage_notes
    or lesson.example is distinct from bank.example
    or lesson.translation is distinct from bank.translation
  );
