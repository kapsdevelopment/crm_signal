import '../application/crm_repositories.dart';
import '../domain/crm_models.dart';

class MockCrmStore implements CrmWorkspaceStore {
  final List<Account> _accounts = [
    const Account(
      id: 'account-1',
      organizationId: 'org-1',
      orgnr: '923456789',
      name: 'Nordic Field Systems AS',
      municipality: 'Oslo',
      nace: '62.010 - Programmeringstjenester',
      roles: [AccountRole.prospect, AccountRole.partner],
      owner: 'Ken',
      updatedLabel: 'I dag',
    ),
    const Account(
      id: 'account-2',
      organizationId: 'org-2',
      orgnr: '934567891',
      name: 'Fjordbygg Prosjekt AS',
      municipality: 'Oslo',
      nace: '43.320 - Snekkerarbeid',
      roles: [AccountRole.customer, AccountRole.supplier],
      owner: 'Ida',
      updatedLabel: 'I går',
    ),
    const Account(
      id: 'account-3',
      organizationId: 'org-3',
      orgnr: '945678912',
      name: 'Linde Eiendom Holding AS',
      municipality: 'Oslo',
      nace: '68.209 - Utleie av fast eiendom',
      roles: [AccountRole.prospect],
      owner: 'Marius',
      updatedLabel: 'Mandag',
    ),
  ];

  final List<Contact> _contacts = [
    const Contact(
      id: 'contact-1',
      accountId: 'account-1',
      name: 'Amalie Berg',
      title: 'Daglig leder',
      email: 'amalie@nordicfield.example',
      phone: '+47 900 11 222',
      isPrimary: true,
    ),
    const Contact(
      id: 'contact-2',
      accountId: 'account-2',
      name: 'Jonas Eide',
      title: 'Prosjektleder',
      email: 'jonas@fjordbygg.example',
      phone: '+47 911 22 333',
      isPrimary: true,
    ),
    const Contact(
      id: 'contact-3',
      accountId: 'account-3',
      name: 'Sara Linde',
      title: 'Partner',
      email: 'sara@lindeholding.example',
      phone: '+47 922 33 444',
      isPrimary: true,
    ),
  ];

  final List<Deal> _deals = [
    const Deal(
      id: 'deal-1',
      accountId: 'account-1',
      title: 'Pilot: signalfeed i salgsarbeid',
      stage: DealStage.proposal,
      valueNok: 95000,
      owner: 'Ken',
    ),
    const Deal(
      id: 'deal-2',
      accountId: 'account-2',
      title: 'Leverandøroppfølging bygg',
      stage: DealStage.qualified,
      valueNok: 42000,
      owner: 'Ida',
    ),
    const Deal(
      id: 'deal-3',
      accountId: 'account-3',
      title: 'Eiendomsprospekt Oslo',
      stage: DealStage.discovery,
      valueNok: 28000,
      owner: 'Marius',
    ),
  ];

  final List<Activity> _activities = [
    const Activity(
      id: 'activity-1',
      accountId: 'account-1',
      title: 'Send kort oppsummering etter demo',
      type: 'Oppgave',
      dueLabel: 'I dag 15:00',
      status: ActivityStatus.open,
    ),
    const Activity(
      id: 'activity-2',
      accountId: 'account-2',
      title: 'Ring om ny underleverandør-rutine',
      type: 'Telefon',
      dueLabel: 'I morgen',
      status: ActivityStatus.open,
    ),
    const Activity(
      id: 'activity-3',
      accountId: 'account-3',
      title: 'Kvalifiser behov for signalvarsling',
      type: 'Møte',
      dueLabel: 'Fredag',
      status: ActivityStatus.open,
    ),
  ];

  final List<Note> _notes = [
    const Note(
      id: 'note-1',
      accountId: 'account-1',
      author: 'Ken',
      body:
          'Interessert i signaler som forklarer hvorfor en ny virksomhet er relevant.',
      createdLabel: 'I dag',
    ),
    const Note(
      id: 'note-2',
      accountId: 'account-2',
      author: 'Ida',
      body:
          'Vil følge med på adresseendringer og statusendringer hos leverandører.',
      createdLabel: 'I går',
    ),
  ];

  final List<CrmSignal> _signals = [
    const CrmSignal(
      id: 'signal-1',
      organizationId: 'org-4',
      orgnr: '956789123',
      organizationName: 'Oslo Cloud Drift AS',
      title: 'Ny virksomhet matcher IT/SaaS ICP',
      reason: 'Aktivt AS i Oslo med NACE 62.020 og tydelig drift/IT-profil.',
      score: 86,
      observedLabel: '12 min siden',
      status: SignalStatus.newSignal,
    ),
    const CrmSignal(
      id: 'signal-2',
      organizationId: 'org-1',
      orgnr: '923456789',
      organizationName: 'Nordic Field Systems AS',
      title: 'Watchlist-treff',
      reason:
          'Organisasjonen finnes i manuell watchlist og har ny Brreg-endring.',
      score: 91,
      observedLabel: '45 min siden',
      status: SignalStatus.linked,
      linkedAccountId: 'account-1',
    ),
    const CrmSignal(
      id: 'signal-3',
      organizationId: 'org-5',
      orgnr: '967891234',
      organizationName: 'Bydel Elektro Service AS',
      title: 'Ny virksomhet matcher håndverk/utbygging',
      reason:
          'Aktivt AS i Oslo med bygg-/installasjonskode og høy lokal relevans.',
      score: 74,
      observedLabel: '2 t siden',
      status: SignalStatus.newSignal,
    ),
  ];

  @override
  List<Account> get accounts => List.unmodifiable(_accounts);

  @override
  List<Contact> get contacts => List.unmodifiable(_contacts);

  @override
  List<Deal> get deals => List.unmodifiable(_deals);

  @override
  List<Activity> get activities => List.unmodifiable(_activities);

  @override
  List<Note> get notes => List.unmodifiable(_notes);

  @override
  List<CrmSignal> get signals => List.unmodifiable(_signals);

  @override
  Future<void> load() async {}

  @override
  void dispose() {}

  @override
  Account? accountById(String id) {
    for (final account in _accounts) {
      if (account.id == id) {
        return account;
      }
    }
    return null;
  }

  @override
  List<Contact> contactsForAccount(String accountId) {
    return _contacts
        .where((contact) => contact.accountId == accountId)
        .toList();
  }

  @override
  List<Deal> dealsForAccount(String accountId) {
    return _deals.where((deal) => deal.accountId == accountId).toList();
  }

  @override
  List<Activity> activitiesForAccount(String accountId) {
    return _activities
        .where((activity) => activity.accountId == accountId)
        .toList();
  }

  @override
  List<Note> notesForAccount(String accountId) {
    return _notes.where((note) => note.accountId == accountId).toList();
  }

  @override
  List<CrmSignal> signalsForAccount(String accountId) {
    return _signals
        .where((signal) => signal.linkedAccountId == accountId)
        .toList();
  }

  @override
  Future<Account> createAccountFromSignal(String signalId) async {
    final signalIndex = _signals.indexWhere((signal) => signal.id == signalId);
    if (signalIndex == -1) {
      throw ArgumentError.value(signalId, 'signalId', 'Unknown signal');
    }

    final signal = _signals[signalIndex];
    for (final account in _accounts) {
      if (account.organizationId == signal.organizationId) {
        _signals[signalIndex] = signal.copyWith(
          status: SignalStatus.linked,
          linkedAccountId: account.id,
        );
        return account;
      }
    }

    final account = Account(
      id: 'account-${_accounts.length + 1}',
      organizationId: signal.organizationId,
      orgnr: signal.orgnr,
      name: signal.organizationName,
      municipality: 'Oslo',
      nace: 'Fra signalfeed',
      roles: const [AccountRole.prospect],
      owner: 'Ken',
      updatedLabel: 'Akkurat nå',
    );

    _accounts.insert(0, account);
    _signals[signalIndex] = signal.copyWith(
      status: SignalStatus.linked,
      linkedAccountId: account.id,
    );
    _activities.insert(
      0,
      Activity(
        id: 'activity-${_activities.length + 1}',
        accountId: account.id,
        title: 'Kvalifiser ${account.name}',
        type: 'Oppgave',
        dueLabel: 'I dag',
        status: ActivityStatus.open,
      ),
    );
    return account;
  }
}
