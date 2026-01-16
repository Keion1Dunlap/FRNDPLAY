import SwiftUI

struct AuthView: View {
    @EnvironmentObject var supa: SupabaseService

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 12) {
            Text("Party Queue (Spotify)").font(.title2).bold()

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let err = supa.authError {
                Text(err).foregroundStyle(.red).font(.footnote)
            }

            HStack(spacing: 12) {
                Button("Sign In") { Task { await supa.signIn(email: email, password: password) } }
                    .buttonStyle(.borderedProminent)

                Button("Sign Up") { Task { await supa.signUp(email: email, password: password) } }
                    .buttonStyle(.bordered)
            }
        }
        .padding()
    }
}
