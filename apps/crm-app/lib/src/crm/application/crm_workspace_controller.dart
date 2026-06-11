import 'package:flutter/foundation.dart';

import '../domain/crm_models.dart';
import 'crm_repositories.dart';
import 'crm_use_cases.dart';

class CrmWorkspaceController extends ChangeNotifier {
  CrmWorkspaceController({
    required this.store,
    required this.createAccountFromSignalUseCase,
  });

  final CrmWorkspaceStore store;
  final CreateAccountFromSignalUseCase createAccountFromSignalUseCase;

  bool _isLoading = false;
  bool _hasLoaded = false;
  String? _creatingSignalId;
  String? _lastErrorMessage;

  List<Account> get accounts => store.accounts;
  List<Contact> get contacts => store.contacts;
  List<Deal> get deals => store.deals;
  List<Activity> get activities => store.activities;
  List<Note> get notes => store.notes;
  List<CrmSignal> get signals => store.signals;

  bool get isLoading => _isLoading;
  bool get hasLoaded => _hasLoaded;
  String? get creatingSignalId => _creatingSignalId;
  String? get lastErrorMessage => _lastErrorMessage;

  int get openSignalCount {
    return signals
        .where((signal) => signal.status == SignalStatus.newSignal)
        .length;
  }

  int get pipelineValueNok {
    return deals.fold<int>(0, (sum, deal) => sum + deal.valueNok);
  }

  Account? accountById(String id) {
    return store.accountById(id);
  }

  List<Contact> contactsForAccount(String accountId) {
    return store.contactsForAccount(accountId);
  }

  List<Deal> dealsForAccount(String accountId) {
    return store.dealsForAccount(accountId);
  }

  List<Activity> activitiesForAccount(String accountId) {
    return store.activitiesForAccount(accountId);
  }

  List<Note> notesForAccount(String accountId) {
    return store.notesForAccount(accountId);
  }

  List<CrmSignal> signalsForAccount(String accountId) {
    return store.signalsForAccount(accountId);
  }

  bool isCreatingAccountFromSignal(String signalId) {
    return _creatingSignalId == signalId;
  }

  Future<void> load() async {
    _isLoading = true;
    _lastErrorMessage = null;
    notifyListeners();

    try {
      await store.load();
      _hasLoaded = true;
    } catch (_) {
      _lastErrorMessage = 'Klarte ikke å laste CRM-data.';
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<Account> createAccountFromSignal(String signalId) async {
    _creatingSignalId = signalId;
    _lastErrorMessage = null;
    notifyListeners();

    try {
      return await createAccountFromSignalUseCase(signalId);
    } catch (_) {
      _lastErrorMessage = 'Klarte ikke å opprette account fra signalet.';
      rethrow;
    } finally {
      _creatingSignalId = null;
      notifyListeners();
    }
  }
}
