import { EncoderProvider } from "src/common/providres/encoder.provider";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import { UserService } from "src/modules/user/user.service";

class AuthListener {
    constructor(
        private readonly userService: UserService,
        private readonly encoderProvider: EncoderProvider,
        private readonly smtpProvider: SMTPProvider
    ) { }

    
    async handleSendWelcomeEmail(userId: string) {
        // Fetch user details
        const user = await this.userService.findUserById(userId);
        if (!user) {
            console.error(`User with ID ${userId} not found.`);
            return;
        }

        // Send welcome email        
        try {
            await this.smtpProvider.sendMail(
                user.email,
                "Welcome to Our Service",
                `Hello ${user.name},\n\nThank you for registering with our service! We're excited to have you on board.\n\nBest regards,\nThe Team`
            );
            console.log(`Welcome email sent to ${user.email}`);
        } catch (error) {
            console.error(`Failed to send welcome email to ${user.email}:`, error);
        }
    }

}