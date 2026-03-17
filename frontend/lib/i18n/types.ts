export interface PluralForms {
  one: string;
  few: string; // used for 2-4 in Russian; same as many for English
  many: string;
}

export interface Translations {
  common: {
    backToLists: string;
    backToLessons: string;
    learn: string;
    repeat: string;
    repeatMore: string;
    cancel: string;
    save: string;
    check: string;
    correct: string;
    notQuite: string;
    correctAnswer: string; // "Correct answer:" label
    dismiss: string; // "Got it, next →"
    sessionDone: string;
    correctOf: string; // e.g. "Correct {correct} of {total}"
    correctLabel: string;
    errorsLabel: string;
    limitTitle: string;
    limitBody: string;
    getPremium: string;
    newWord: string;
    gotIt: string;
    review: string; // "Повторение" — flashcard stage label in review mode
  };
  nav: {
    dictionaries: string;
    grammar: string;
    practice: string;
    articles: string;
    beta: string;
    signIn: string;
    admin: string;
    signOut: string;
    menu: string;
    langToggleSoon: string;
  };
  login: {
    title: string;
    subtitle: string;
    signInGoogle: string;
    back: string;
  };
  pricing: {
    badge: string;
    title: string;
    mission: string;
    freeLabel: string;
    freePrice: string;
    perMonth: string;
    startFree: string;
    premiumPrice: string;
    contactUs: string;
    contactNote: string;
    whyTitle: string;
    whyBody: string;
    backToLists: string;
    freeFeatures: string[];
    premiumFeatures: string[];
  };
  lists: {
    limitReached: string; // {count}/{limit} interpolated by caller
    sessionsToday: string; // {count}/{limit}
    getPremium: string;
    premiumUntil: string; // date interpolated by caller
    title: string;
    subtitle: string;
    listsCount: PluralForms;
    wordsCount: PluralForms;
    learned: string; // "{known} / {total}"
    inProgress: PluralForms;
    browse: string;
    study: string;
    studyDisabledTitle: string;
    subcategories: Record<string, string>;
  };
  detail: {
    backToLists: string;
    studyBtn: string;
    wordsCount: PluralForms;
    columnLithuanian: string;
    columnTranslation: string;
    columnNote: string;
  };
  study: {
    backToLists: string;
    stages: [string, string, string, string]; // index 0 unused
    whatMeans: string;
    fillMissing: string;
    howInLithuanian: string;
    typePlaceholder: string;
  };
  grammar: {
    title: string;
    subtitle: string;
    betaNotice: string;
    grammarHint: string;
    grammarRule: string;
    singular: string;
    plural: string;
    levelsCount: PluralForms;
    lessonsCount: PluralForms;
    tasksCount: PluralForms;
    comingSoon: string;
    levels: Record<string, string>;
    categories: { padezhi: string; vremena: string };
    lessonDone: string;
    passed: string;
    failedScore: string;
    failedHint: string;
    nextLesson: string;
    backToLessons: string;
    fillBlank: string;
    buildForm: string;
    typeDeclension: string;
    typeEnding: string;
  };
  practice: {
    title: string;
    comingSoon: string;
  };
  review: {
    mistakesMode: string;
    knownMode: string;
    mistakesLabel: string;
    knownLabel: string;
    nothingTitle: string;
    nothingBody: PluralForms; // "Пока нет {mistakes/learned} для повторения"
  };
  admin: {
    title: string;
    subtitle: string;
    tabUsers: string;
    tabReports: string;
    tabArticles: string;
    tabLists: string;
    colList: string;
    colCefr: string;
    colDifficulty: string;
    colArticleUrl: string;
    colArticleName: string;
    noLists: string;
    difficultyOptions: Record<string, string>;
    colUser: string;
    colPlan: string;
    colPremiumUntil: string;
    colSessionsToday: string;
    colAction: string;
    superadmin: string;
    adminBadge: string;
    premium: string;
    basic: string;
    save: string;
    cancel: string;
    revoke: string;
    extend: string;
    grantPremium: string;
    makeAdmin: string;
    removeAdmin: string;
    noReports: string;
    resolvedBadge: string;
    resolve: string;
    delete: string;
    deleteConfirm: string;
  };
  articles: {
    title: string;
    subtitle: string;
    readMore: string;
    noArticles: string;
    backToArticles: string;
    langRu: string;
    langEn: string;
    adminTitle: string;
    newArticle: string;
    editArticle: string;
    deleteArticle: string;
    deleteConfirm: string;
    importArticle: string;
    exportArticle: string;
    slugLabel: string;
    titleRuLabel: string;
    titleEnLabel: string;
    tagsLabel: string;
    publishedLabel: string;
    bodyRuLabel: string;
    bodyEnLabel: string;
    saveSuccess: string;
    saveError: string;
    importSuccess: string;
    importError: string;
    published: string;
    draft: string;
  };
  stats: {
    wordsLearned: string;
    reviewLearned: string;
    reviewMistakes: string; // "{n}" interpolated by caller
    streakDay: PluralForms;
    motivations: {
      streak30: string;
      streak14: string;
      streak7: string;
      streak3: string;
      streak2: string;
      known100: string;
      known50: string;
      knownSome: string;
      none: string;
    };
  };
  cookie: {
    message: string;
    messageNote: string;
    decline: string;
    accept: string;
  };
  mistake: {
    trigger: string;
    title: string;
    subtitle: string;
    placeholder: string;
    sent: string;
    error: string;
    cancel: string;
    send: string;
  };
}
