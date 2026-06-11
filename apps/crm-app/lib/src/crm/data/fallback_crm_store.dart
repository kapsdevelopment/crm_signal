import '../application/crm_repositories.dart';
import '../domain/crm_models.dart';

class FallbackCrmStore implements CrmWorkspaceStore {
  FallbackCrmStore({
    required this.primary,
    required this.fallback,
  }) : _active = primary;

  final CrmWorkspaceStore primary;
  final CrmWorkspaceStore fallback;
  CrmWorkspaceStore _active;

  bool _usingFallback = false;
  Object? _lastPrimaryError;

  bool get usingFallback => _usingFallback;
  Object? get lastPrimaryError => _lastPrimaryError;

  @override
  List<Account> get accounts => _active.accounts;

  @override
  List<Contact> get contacts => _active.contacts;

  @override
  List<Deal> get deals => _active.deals;

  @override
  List<Activity> get activities => _active.activities;

  @override
  List<Note> get notes => _active.notes;

  @override
  List<CrmSignal> get signals => _active.signals;

  @override
  Future<void> load() async {
    try {
      await primary.load();
      _active = primary;
      _usingFallback = false;
      _lastPrimaryError = null;
    } catch (error) {
      _lastPrimaryError = error;
      await fallback.load();
      _active = fallback;
      _usingFallback = true;
    }
  }

  @override
  Account? accountById(String id) {
    return _active.accountById(id);
  }

  @override
  List<Contact> contactsForAccount(String accountId) {
    return _active.contactsForAccount(accountId);
  }

  @override
  List<Deal> dealsForAccount(String accountId) {
    return _active.dealsForAccount(accountId);
  }

  @override
  List<Activity> activitiesForAccount(String accountId) {
    return _active.activitiesForAccount(accountId);
  }

  @override
  List<Note> notesForAccount(String accountId) {
    return _active.notesForAccount(accountId);
  }

  @override
  List<CrmSignal> signalsForAccount(String accountId) {
    return _active.signalsForAccount(accountId);
  }

  @override
  Future<Account> createAccountFromSignal(String signalId) {
    return _active.createAccountFromSignal(signalId);
  }

  @override
  void dispose() {
    primary.dispose();
    fallback.dispose();
  }
}
