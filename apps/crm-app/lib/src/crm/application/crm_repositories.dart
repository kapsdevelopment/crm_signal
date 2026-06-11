import '../domain/crm_models.dart';

abstract class CrmWorkspaceStore implements CrmRepository, SignalRepository {
  Future<void> load();

  void dispose() {}
}

abstract class CrmRepository {
  List<Account> get accounts;
  List<Contact> get contacts;
  List<Deal> get deals;
  List<Activity> get activities;
  List<Note> get notes;

  Account? accountById(String id);
  List<Contact> contactsForAccount(String accountId);
  List<Deal> dealsForAccount(String accountId);
  List<Activity> activitiesForAccount(String accountId);
  List<Note> notesForAccount(String accountId);

  Future<Account> createAccountFromSignal(String signalId);
}

abstract class SignalRepository {
  List<CrmSignal> get signals;

  List<CrmSignal> signalsForAccount(String accountId);
}
