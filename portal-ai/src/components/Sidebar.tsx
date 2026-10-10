//src/components/Sidebar.tsx
import {currentUser} from "@clerk/nextjs/server";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {SignInButton, SignUpButton} from "@clerk/nextjs";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import { Avatar, AvatarImage } from "./ui/avatar";
import {Separator} from "@/components/ui/separator";
import {LinkIcon, MapPinIcon} from "lucide-react";


export async function Sidebar() {
}
export default Sidebar;

const UnAuthenticatedSidebar = () => (
    <div className="sticky top-20">
        <Card>
            <CardHeader>
                <CardTitle className="text-center text-xl font-semibold">Welcome Back!</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground mb-4">
                    Login to access your profile and connect with others.
                </p>
                <SignInButton mode="modal">
                    <Button className="w-full" variant="outline">
                        Login
                    </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                    <Button className="w-full mt-2" variant="default">
                        Sign Up
                    </Button>
                </SignUpButton>
            </CardContent>
        </Card>
    </div>
);